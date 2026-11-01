-- Referrals and wallet credit.
--
-- Two separate wallets per person: 'customer' (spent on trips) and 'driver' (spent on passes).
-- Every change is a row in wallet_entries, so the balance is always the sum and there is a full audit trail.
--
-- Rules (numbers live in settings so they can be changed without a deploy):
--   Driver refers driver:   the referrer gets ₹50 after the new driver delivers their first trip.
--   Customer refers customer: the new customer gets ₹50 straight away; the referrer gets ₹50 after the
--                             new customer's first delivered trip.
--   Using customer credit lowers what the customer pays the driver. Pikop makes the driver whole by crediting
--   the same amount to the driver's wallet once the trip is delivered (customers pay drivers directly,
--   so a discount must never come out of the driver's pocket).

alter table public.settings
  add column referral_driver_reward integer not null default 50,
  add column referral_customer_reward integer not null default 50,
  add column referral_customer_welcome integer not null default 50,
  add column referral_max_driver integer not null default 10,
  add column referral_max_customer integer not null default 5,
  add column wallet_max_percent integer not null default 50 check (wallet_max_percent between 0 and 100),
  -- Conditions: switch each programme on or off, and say what counts as a "first trip".
  add column referral_driver_enabled boolean not null default true,
  add column referral_customer_enabled boolean not null default true,
  add column referral_min_trip_m integer not null default 1000 check (referral_min_trip_m >= 0),
  add column referral_min_fare integer not null default 0 check (referral_min_fare >= 0);

alter table public.profiles
  add column referral_code text unique;

alter table public.jobs
  add column wallet_discount integer not null default 0 check (wallet_discount >= 0);

alter table public.driver_passes
  add column wallet_rupees integer not null default 0 check (wallet_rupees >= 0);

create table public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  wallet text not null check (wallet in ('customer', 'driver')),
  amount_rupees integer not null check (amount_rupees <> 0),   -- positive = credit, negative = spend
  kind text not null check (kind in (
    'referral_welcome', 'referral_reward', 'ride_discount', 'ride_refund', 'ride_compensation',
    'pass_payment', 'admin_adjust'
  )),
  job_id uuid references public.jobs (id),
  ref_user uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create index wallet_entries_user_idx on public.wallet_entries (user_id, wallet, created_at desc);
-- A trip can only be discounted / refunded / compensated once.
create unique index wallet_entries_job_once on public.wallet_entries (job_id, kind) where job_id is not null;
-- A referral can only pay out once to each person.
create unique index wallet_entries_referral_once on public.wallet_entries (user_id, wallet, kind, ref_user)
  where kind in ('referral_welcome', 'referral_reward');

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_id uuid not null references public.profiles (id) on delete cascade,
  wallet text not null check (wallet in ('customer', 'driver')),
  status text not null default 'pending' check (status in ('pending', 'rewarded', 'capped')),
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  unique (referred_id, wallet),
  check (referrer_id <> referred_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id, wallet);

alter table public.wallet_entries enable row level security;
alter table public.referrals enable row level security;
create policy "own wallet entries" on public.wallet_entries for select using (user_id = auth.uid() or public.is_admin());
create policy "own referrals" on public.referrals for select
  using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.wallet_balance(p_user uuid, p_wallet text) returns integer
language sql stable security definer set search_path = public as $$
  select case when p_user = auth.uid() or public.is_admin() or public.is_service_role()
              then coalesce((select sum(amount_rupees) from public.wallet_entries where user_id = p_user and wallet = p_wallet), 0)::integer
         end;
$$;

create or replace function public.my_wallet(p_wallet text) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount_rupees) from public.wallet_entries where user_id = auth.uid() and wallet = p_wallet), 0)::integer;
$$;

-- Everyone gets a short code the first time they look. No look-alike characters (0/O, 1/I).
create or replace function public.my_referral_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select referral_code into v_code from public.profiles where id = auth.uid();
  if v_code is not null then return v_code; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
    end loop;
    begin
      update public.profiles set referral_code = v_code where id = auth.uid() and referral_code is null;
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  select referral_code into v_code from public.profiles where id = auth.uid();
  return v_code;
end;
$$;

-- Apply someone's code. Returns the welcome credit (₹) the caller received now (0 for drivers).
create or replace function public.apply_referral_code(p_code text, p_wallet text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_referrer uuid;
  s public.settings;
  v_welcome integer := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_wallet not in ('customer', 'driver') then raise exception 'invalid wallet'; end if;
  select * into s from public.settings;
  select id into v_referrer from public.profiles where referral_code = upper(trim(p_code));
  if v_referrer is null then raise exception 'That referral code was not found'; end if;
  if v_referrer = auth.uid() then raise exception 'You cannot use your own code'; end if;
  if exists (select 1 from public.referrals where referred_id = auth.uid() and wallet = p_wallet) then
    raise exception 'You have already used a referral code';
  end if;

  if (p_wallet = 'driver' and not s.referral_driver_enabled) or (p_wallet = 'customer' and not s.referral_customer_enabled) then
    raise exception 'Referrals are switched off right now';
  end if;

  if p_wallet = 'driver' then
    if not exists (select 1 from public.drivers where id = auth.uid()) then raise exception 'Sign up as a driver first'; end if;
    if not exists (select 1 from public.drivers where id = v_referrer) then raise exception 'That code does not belong to a driver'; end if;
    if exists (select 1 from public.jobs where driver_id = auth.uid() and status = 'delivered') then
      raise exception 'Referral codes only work before your first delivery';
    end if;
  else
    if exists (select 1 from public.jobs where customer_id = auth.uid()) then
      raise exception 'Referral codes only work before your first booking';
    end if;
  end if;

  insert into public.referrals (referrer_id, referred_id, wallet) values (v_referrer, auth.uid(), p_wallet);

  if p_wallet = 'customer' and s.referral_customer_welcome > 0 then
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
    values (auth.uid(), 'customer', s.referral_customer_welcome, 'referral_welcome', v_referrer, 'Welcome credit');
    v_welcome := s.referral_customer_welcome;
  end if;
  return v_welcome;
end;
$$;

-- The people I referred, with the name hidden down to a first name / last four digits.
create or replace function public.my_referrals(p_wallet text)
returns table (who text, status text, reward integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''), '••••' || right(coalesce(p.phone, ''), 4)),
         r.status,
         case when r.status = 'rewarded' then
           (select e.amount_rupees from public.wallet_entries e
             where e.user_id = r.referrer_id and e.wallet = r.wallet and e.kind = 'referral_reward' and e.ref_user = r.referred_id)
         end,
         r.created_at
  from public.referrals r join public.profiles p on p.id = r.referred_id
  where r.referrer_id = auth.uid() and r.wallet = p_wallet
  order by r.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Paying out the referrer after the first delivered trip
-- ---------------------------------------------------------------------------

-- On delivery: pay referral rewards, and make the driver whole for any wallet discount the customer used.
create or replace function public.on_job_delivered() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.pay_referral_rewards_for(new);
  if new.wallet_discount > 0 and new.driver_id is not null then
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, job_id, note)
    values (new.driver_id, 'driver', new.wallet_discount, 'ride_compensation', new.id, 'Customer used wallet credit on this trip')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.pay_referral_rewards_for(new public.jobs) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  r public.referrals;
  v_amount integer;
  v_max integer;
  v_paid integer;
begin
  select * into s from public.settings;
  -- Short or tiny-fare trips and self-dealing do not count as a first trip.
  if new.distance_m < s.referral_min_trip_m or new.fare_rupees < s.referral_min_fare or new.customer_id = new.driver_id then return; end if;

  -- Customer's first delivered trip pays the person who referred them.
  select * into r from public.referrals where referred_id = new.customer_id and wallet = 'customer' and status = 'pending';
  if r.id is not null
     and (select count(*) from public.jobs where customer_id = new.customer_id and status = 'delivered') = 1 then
    v_amount := s.referral_customer_reward; v_max := s.referral_max_customer;
    select count(*) into v_paid from public.referrals where referrer_id = r.referrer_id and wallet = 'customer' and status = 'rewarded';
    if v_paid >= v_max or v_amount <= 0 then
      update public.referrals set status = 'capped', rewarded_at = now() where id = r.id;
    else
      insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
      values (r.referrer_id, 'customer', v_amount, 'referral_reward', r.referred_id, 'A friend you referred finished their first trip');
      update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id;
    end if;
  end if;

  -- Driver's first delivered trip pays the driver who referred them.
  if new.driver_id is not null then
    select * into r from public.referrals where referred_id = new.driver_id and wallet = 'driver' and status = 'pending';
    if r.id is not null
       and (select count(*) from public.jobs where driver_id = new.driver_id and status = 'delivered') = 1 then
      v_amount := s.referral_driver_reward; v_max := s.referral_max_driver;
      select count(*) into v_paid from public.referrals where referrer_id = r.referrer_id and wallet = 'driver' and status = 'rewarded';
      if v_paid >= v_max or v_amount <= 0 then
        update public.referrals set status = 'capped', rewarded_at = now() where id = r.id;
      else
        insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
        values (r.referrer_id, 'driver', v_amount, 'referral_reward', r.referred_id, 'A driver you referred finished their first trip');
        update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id;
      end if;
    end if;
  end if;
end;
$$;

create trigger jobs_on_delivered after update of status on public.jobs
  for each row when (new.status = 'delivered' and old.status is distinct from 'delivered')
  execute function public.on_job_delivered();

-- A cancelled trip gives the customer their credit back.
create or replace function public.on_job_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.wallet_discount > 0 then
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, job_id, note)
    values (new.customer_id, 'customer', new.wallet_discount, 'ride_refund', new.id, 'Trip cancelled')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger jobs_on_cancelled after update of status on public.jobs
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.on_job_cancelled();

-- ---------------------------------------------------------------------------
-- Booking with wallet credit
-- ---------------------------------------------------------------------------

drop function if exists public.create_job(
  text, double precision, double precision, text, double precision, double precision,
  text, text, integer, integer, text, text, text, text, text);

create or replace function public.create_job(
  p_pickup_address text, p_pickup_lat double precision, p_pickup_lng double precision,
  p_drop_address text, p_drop_lat double precision, p_drop_lng double precision,
  p_receiver_name text, p_receiver_phone text,
  p_distance_m integer, p_duration_s integer,
  p_item_note text default null,
  p_pickup_contact_name text default null, p_pickup_contact_phone text default null,
  p_payment_mode text default 'cash',
  p_pay_at text default 'drop',
  p_use_wallet boolean default false
) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_min_m integer;
  v_distance integer;
  v_fare integer;
  v_discount integer := 0;
  s public.settings;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Road distance can't be shorter than the straight line.
  v_min_m := ceil(public.haversine_m(p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng));
  v_distance := greatest(coalesce(p_distance_m, 0), v_min_m);
  if v_distance < 100 then raise exception 'pickup and drop are too close'; end if;
  if v_distance > 60000 then raise exception 'trip is longer than 60 km'; end if;
  v_fare := public.compute_fare(v_distance);

  if p_use_wallet then
    select * into s from public.settings;
    -- Serialise one customer's bookings so two taps cannot spend the same credit twice.
    perform 1 from public.profiles where id = auth.uid() for update;
    v_discount := least(public.my_wallet('customer'), floor(v_fare * s.wallet_max_percent / 100.0)::integer);
    if v_discount < 0 then v_discount := 0; end if;
  end if;

  insert into public.jobs (
    customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    drop_address, drop_lat, drop_lng, receiver_name, receiver_phone, item_note,
    distance_m, duration_s, fare_rupees, payment_mode, pay_at, wallet_discount
  ) values (
    auth.uid(), p_pickup_address, p_pickup_lat, p_pickup_lng, p_pickup_contact_name, p_pickup_contact_phone,
    p_drop_address, p_drop_lat, p_drop_lng, p_receiver_name, p_receiver_phone, p_item_note,
    v_distance, p_duration_s, v_fare, p_payment_mode, p_pay_at, v_discount
  ) returning * into v_job;

  if v_discount > 0 then
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, job_id, note)
    values (auth.uid(), 'customer', -v_discount, 'ride_discount', v_job.id, 'Used on a trip');
  end if;

  insert into public.job_secrets (job_id, pickup_otp, drop_otp)
  values (v_job.id, public.random_otp(), public.random_otp());

  return v_job;
end;
$$;

-- Tracking page: the receiver needs the amount actually due, so expose the discount.
drop function if exists public.get_tracking(text);

create or replace function public.get_tracking(p_token text)
returns table (
  status public.job_status, pickup_address text, pickup_lat double precision, pickup_lng double precision,
  drop_address text, drop_lat double precision, drop_lng double precision,
  driver_name text, vehicle_number text, driver_lat double precision, driver_lng double precision,
  driver_seen_at timestamptz, created_at timestamptz, delivered_at timestamptz,
  fare_rupees integer, pay_at text, payment_mode text, wallet_discount integer
)
language sql stable security definer set search_path = public as $$
  select j.status, j.pickup_address, j.pickup_lat, j.pickup_lng,
         j.drop_address, j.drop_lat, j.drop_lng,
         d.full_name, d.vehicle_number,
         case when j.status in ('accepted', 'picked_up') then d.last_lat end,
         case when j.status in ('accepted', 'picked_up') then d.last_lng end,
         case when j.status in ('accepted', 'picked_up') then d.last_seen_at end,
         j.created_at, j.delivered_at,
         j.fare_rupees, j.pay_at, j.payment_mode, j.wallet_discount
  from public.jobs j left join public.drivers d on d.id = j.driver_id
  where j.tracking_token = p_token;
$$;

grant execute on function public.get_tracking(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Paying for a pass with wallet credit
-- ---------------------------------------------------------------------------

-- Driver pays the whole pass from their wallet. Takes effect immediately.
create or replace function public.driver_buy_pass_with_wallet(p_kind text) returns public.driver_passes
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  v_price integer;
  v_start timestamptz;
  v_pass public.driver_passes;
begin
  if p_kind not in ('daily', 'weekly') then raise exception 'invalid pass kind'; end if;
  if not exists (select 1 from public.drivers where id = auth.uid() and kyc_status = 'approved') then
    raise exception 'Your documents must be approved first';
  end if;
  perform 1 from public.profiles where id = auth.uid() for update;
  select * into s from public.settings;
  v_price := case p_kind when 'daily' then s.daily_pass_price else s.weekly_pass_price end;
  if public.my_wallet('driver') < v_price then raise exception 'Not enough wallet credit for this pass'; end if;

  select greatest(now(), coalesce(max(ends_at), now())) into v_start from public.driver_passes where driver_id = auth.uid();
  insert into public.driver_passes (driver_id, kind, starts_at, ends_at, amount_rupees, wallet_rupees, recorded_by, note)
  values (auth.uid(), p_kind, v_start,
          v_start + case p_kind when 'daily' then interval '1 day' else interval '7 days' end,
          v_price, v_price, auth.uid(), 'Paid from wallet')
  returning * into v_pass;
  insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, note)
  values (auth.uid(), 'driver', -v_price, 'pass_payment', p_kind || ' pass');
  return v_pass;
end;
$$;

-- Admin records a pass the driver paid for partly or fully with wallet credit (the rest by UPI/cash).
drop function if exists public.admin_add_pass(uuid, text, text);

create or replace function public.admin_add_pass(p_driver uuid, p_kind text, p_note text default null, p_wallet_rupees integer default 0)
returns public.driver_passes
language plpgsql security definer set search_path = public as $$
declare
  v_pass public.driver_passes;
  v_start timestamptz;
  v_price integer;
  s public.settings;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_kind not in ('daily', 'weekly') then raise exception 'invalid pass kind'; end if;
  select * into s from public.settings;
  v_price := case p_kind when 'daily' then s.daily_pass_price else s.weekly_pass_price end;
  if p_wallet_rupees < 0 or p_wallet_rupees > v_price then raise exception 'wallet amount must be between 0 and the pass price'; end if;
  if p_wallet_rupees > 0 then
    perform 1 from public.profiles where id = p_driver for update;
    if public.wallet_balance(p_driver, 'driver') < p_wallet_rupees then raise exception 'driver does not have that much wallet credit'; end if;
  end if;
  -- Stack on top of any pass still running.
  select greatest(now(), coalesce(max(ends_at), now())) into v_start from public.driver_passes where driver_id = p_driver;
  insert into public.driver_passes (driver_id, kind, starts_at, ends_at, amount_rupees, wallet_rupees, recorded_by, note)
  values (p_driver, p_kind, v_start,
          v_start + case p_kind when 'daily' then interval '1 day' else interval '7 days' end,
          v_price, p_wallet_rupees, auth.uid(), p_note)
  returning * into v_pass;
  if p_wallet_rupees > 0 then
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, note)
    values (p_driver, 'driver', -p_wallet_rupees, 'pass_payment', p_kind || ' pass (part paid from wallet)');
  end if;
  return v_pass;
end;
$$;

-- Admin: add or remove credit by hand (goodwill, corrections). Needs a reason.
create or replace function public.admin_adjust_wallet(p_user uuid, p_wallet text, p_amount integer, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'a reason is required'; end if;
  if p_amount = 0 then raise exception 'amount cannot be zero'; end if;
  if p_amount < 0 and public.wallet_balance(p_user, p_wallet) + p_amount < 0 then raise exception 'balance cannot go below zero'; end if;
  insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, note)
  values (p_user, p_wallet, p_amount, 'admin_adjust', p_note);
end;
$$;

grant execute on function
  public.wallet_balance(uuid, text), public.my_wallet(text), public.my_referral_code(),
  public.apply_referral_code(text, text), public.my_referrals(text),
  public.driver_buy_pass_with_wallet(text), public.admin_add_pass(uuid, text, text, integer),
  public.admin_adjust_wallet(uuid, text, integer, text)
  to authenticated;
revoke execute on function public.on_job_delivered(), public.on_job_cancelled(), public.pay_referral_rewards_for(public.jobs) from public, anon, authenticated;
