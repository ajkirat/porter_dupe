-- 0016: every referral direction has its own rules.
--   driver_driver, driver_customer, customer_driver, customer_customer: a person refers another person.
--   pikop_driver, pikop_customer: Pikop itself gives a bonus to new people who came without a referral.
-- Rules live in referral_rules and are edited in Admin -> Referrals. Old settings columns are kept in sync
-- for driver_driver and driver_customer so apps that are not updated yet keep working.

create table if not exists public.referral_rules (
  flow text primary key check (flow in ('driver_driver','driver_customer','customer_driver','customer_customer','pikop_driver','pikop_customer')),
  enabled boolean not null default false,
  referrer_reward integer not null default 0 check (referrer_reward >= 0),   -- credit for the person who referred
  referred_reward integer not null default 0 check (referred_reward >= 0),   -- credit for the new person
  referred_when text not null default 'trips' check (referred_when in ('signup','trips')),
  trips integer not null default 1 check (trips >= 1),                        -- deliveries the new person must reach
  monthly_cap integer not null default 3 check (monthly_cap >= 0),            -- paid referrals per referrer per month
  starts_at timestamptz,                                                      -- pikop_*: only people who joined after this
  updated_at timestamptz not null default now()
);
alter table public.referral_rules enable row level security;
drop policy if exists "anyone signed in reads rules" on public.referral_rules;
create policy "anyone signed in reads rules" on public.referral_rules for select using (auth.uid() is not null);
drop policy if exists "admin edits rules" on public.referral_rules;
create policy "admin edits rules" on public.referral_rules for all using (public.is_admin()) with check (public.is_admin());

insert into public.referral_rules (flow, enabled, referrer_reward, referred_reward, referred_when, trips, monthly_cap)
select 'driver_driver', s.referral_driver_enabled, s.referral_driver_reward, 0, 'trips', s.referral_driver_trips, s.referral_max_driver from public.settings s
on conflict (flow) do nothing;
insert into public.referral_rules (flow, enabled, referrer_reward, referred_reward, referred_when, trips, monthly_cap)
select 'driver_customer', s.referral_customer_enabled, s.referral_customer_reward, s.referral_customer_welcome, 'signup', s.referral_customer_trips, s.referral_max_customer from public.settings s
on conflict (flow) do nothing;
insert into public.referral_rules (flow, trips) values
  ('customer_driver', 5), ('customer_customer', 3), ('pikop_driver', 5), ('pikop_customer', 3)
on conflict (flow) do nothing;

-- Keep the old settings columns in step so older app versions still show the right numbers.
create or replace function public.sync_settings_from_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.flow = 'driver_driver' then
    update public.settings set referral_driver_enabled = new.enabled, referral_driver_reward = new.referrer_reward,
      referral_driver_trips = new.trips, referral_max_driver = new.monthly_cap;
  elsif new.flow = 'driver_customer' then
    update public.settings set referral_customer_enabled = new.enabled, referral_customer_reward = new.referrer_reward,
      referral_customer_trips = new.trips, referral_max_customer = new.monthly_cap,
      referral_customer_welcome = case when new.referred_when = 'signup' then new.referred_reward else 0 end;
  end if;
  return new;
end $$;
drop trigger if exists referral_rules_sync on public.referral_rules;
create trigger referral_rules_sync after update on public.referral_rules for each row execute function public.sync_settings_from_rules();

alter table public.referrals add column if not exists flow text;
update public.referrals r set flow =
  (case when exists (select 1 from public.drivers d where d.id = r.referrer_id) then 'driver' else 'customer' end) || '_' || r.wallet
 where flow is null;

alter table public.wallet_entries drop constraint if exists wallet_entries_kind_check;
alter table public.wallet_entries add constraint wallet_entries_kind_check check (kind in (
  'referral_welcome', 'referral_reward', 'pikop_welcome', 'ride_discount', 'ride_refund', 'ride_compensation', 'pass_payment', 'admin_adjust'));

-- Using a code: the flow is decided by who the code belongs to and who is using it.
create or replace function public.apply_referral_code(p_code text, p_wallet text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_referrer uuid; v_flow text; r public.referral_rules; v_welcome integer := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_wallet not in ('customer', 'driver') then raise exception 'invalid wallet'; end if;
  select id into v_referrer from public.profiles where referral_code = upper(trim(p_code));
  if v_referrer is null then raise exception 'That referral code was not found'; end if;
  if v_referrer = auth.uid() then raise exception 'You cannot use your own code'; end if;
  if exists (select 1 from public.referrals where referred_id = auth.uid() and wallet = p_wallet) then
    raise exception 'You have already used a referral code';
  end if;
  v_flow := (case when exists (select 1 from public.drivers where id = v_referrer) then 'driver' else 'customer' end) || '_' || p_wallet;
  select * into r from public.referral_rules where flow = v_flow;
  if r.flow is null or not r.enabled then raise exception 'Referrals are switched off right now'; end if;

  if p_wallet = 'driver' then
    if not exists (select 1 from public.drivers where id = auth.uid()) then raise exception 'Sign up as a driver first'; end if;
    if exists (select 1 from public.jobs where driver_id = auth.uid() and status = 'delivered') then
      raise exception 'Referral codes only work before your first delivery';
    end if;
  else
    if exists (select 1 from public.jobs where customer_id = auth.uid()) then
      raise exception 'Referral codes only work before your first booking';
    end if;
  end if;

  insert into public.referrals (referrer_id, referred_id, wallet, flow) values (v_referrer, auth.uid(), p_wallet, v_flow);
  if r.referred_when = 'signup' and r.referred_reward > 0 then
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
    values (auth.uid(), p_wallet, r.referred_reward, 'referral_welcome', v_referrer, 'Welcome credit');
    v_welcome := r.referred_reward;
  end if;
  return v_welcome;
end $$;

-- After a delivery: move one referred person forward, and give Pikop's own bonus to people who came with no referral.
create or replace function public.referral_step(p_user uuid, p_wallet text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.referrals; rule public.referral_rules; v_n integer; v_paid integer; v_wallet text; v_since timestamptz; v_created timestamptz;
begin
  v_n := case when p_wallet = 'driver'
    then (select count(*) from public.jobs where driver_id = p_user and status = 'delivered')
    else (select count(*) from public.jobs where customer_id = p_user and status = 'delivered') end;

  select * into r from public.referrals where referred_id = p_user and wallet = p_wallet and status = 'pending';
  if r.id is not null then
    select * into rule from public.referral_rules where flow = r.flow;
    if rule.flow is null or not rule.enabled then
      update public.referrals set status = 'capped', rewarded_at = now() where id = r.id;
    elsif v_n >= rule.trips then
      select count(*) into v_paid from public.referrals
       where referrer_id = r.referrer_id and flow = r.flow and status = 'rewarded' and rewarded_at >= date_trunc('month', now());
      if v_paid >= rule.monthly_cap or rule.referrer_reward <= 0 then
        update public.referrals set status = 'capped', rewarded_at = now() where id = r.id;
      else
        v_wallet := case when exists (select 1 from public.drivers where id = r.referrer_id) then 'driver' else 'customer' end;
        insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
        values (r.referrer_id, v_wallet, rule.referrer_reward, 'referral_reward', r.referred_id,
                'A ' || p_wallet || ' you referred completed ' || rule.trips || ' deliveries')
        on conflict do nothing;
        update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id;
      end if;
      if rule.referred_when = 'trips' and rule.referred_reward > 0 then
        insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
        values (p_user, p_wallet, rule.referred_reward, 'referral_welcome', r.referrer_id, 'Welcome credit')
        on conflict do nothing;
      end if;
    end if;
    return;
  end if;

  -- No referral: Pikop's own bonus, once per person, only for people who joined after the rule was switched on.
  if exists (select 1 from public.referrals where referred_id = p_user and wallet = p_wallet) then return; end if;
  select * into rule from public.referral_rules where flow = 'pikop_' || p_wallet;
  if rule.flow is null or not rule.enabled or rule.referred_reward <= 0 or rule.starts_at is null or v_n < rule.trips then return; end if;
  v_created := case when p_wallet = 'driver' then (select created_at from public.drivers where id = p_user)
                    else (select created_at from public.profiles where id = p_user) end;
  if v_created is null or v_created < rule.starts_at then return; end if;
  if exists (select 1 from public.wallet_entries where user_id = p_user and wallet = p_wallet and kind = 'pikop_welcome') then return; end if;
  insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, note)
  values (p_user, p_wallet, rule.referred_reward, 'pikop_welcome', 'Welcome bonus from Pikop');
end $$;

create or replace function public.pay_referral_rewards_for(new public.jobs) returns void
language plpgsql security definer set search_path = public as $$
declare s public.settings;
begin
  select * into s from public.settings;
  if new.distance_m < s.referral_min_trip_m or new.fare_rupees < s.referral_min_fare or new.customer_id = new.driver_id then return; end if;
  perform public.referral_step(new.customer_id, 'customer');
  if new.driver_id is not null then perform public.referral_step(new.driver_id, 'driver'); end if;
end $$;

-- The people I referred (any kind) and what each earned me.
create or replace function public.my_referrals(p_wallet text)
returns table (who text, status text, reward integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''), '••••' || right(coalesce(p.phone, ''), 4)),
         r.status,
         case when r.status = 'rewarded' then
           (select e.amount_rupees from public.wallet_entries e
             where e.user_id = r.referrer_id and e.kind = 'referral_reward' and e.ref_user = r.referred_id limit 1)
         end,
         r.created_at
  from public.referrals r join public.profiles p on p.id = r.referred_id
  where r.referrer_id = auth.uid()
  order by r.created_at desc;
$$;

revoke execute on function public.referral_step(uuid, text), public.pay_referral_rewards_for(public.jobs), public.sync_settings_from_rules() from public, anon, authenticated;
