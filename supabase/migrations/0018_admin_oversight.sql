-- 0018: admin oversight. Idempotent.
--  * admin_audit: an append-only record of what admins and the system changed (wallet adjustments, passes, KYC, rules, settings).
--  * wallet_entries: the amount, owner and kind of an entry can never be edited (only the "remaining" bookkeeping moves).
--  * Referral rewards no longer count trips between the referrer and the person they referred (circular trips).
--  * admin_people / admin_person_detail: full wallet and activity per driver or customer.
--  * admin_risk_flags: an automatic watchlist of suspicious patterns.

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,                 -- auth.uid(): the admin, or null for the system
  action text not null,
  subject uuid,               -- the person affected, when there is one
  detail jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_at_idx on public.admin_audit (at desc);
create index if not exists admin_audit_subject_idx on public.admin_audit (subject, at desc);
alter table public.admin_audit enable row level security;
drop policy if exists "admin reads audit" on public.admin_audit;
create policy "admin reads audit" on public.admin_audit for select using (public.is_admin());

create or replace function public.audit_no_edit() returns trigger language plpgsql as $$
begin raise exception 'the audit log cannot be changed'; end $$;
drop trigger if exists admin_audit_no_update on public.admin_audit;
create trigger admin_audit_no_update before update or delete on public.admin_audit for each row execute function public.audit_no_edit();

create or replace function public.audit_wallet_adjust() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'admin_adjust' then
    insert into public.admin_audit (actor, action, subject, detail)
    values (auth.uid(), 'wallet_adjust', new.user_id, jsonb_build_object('wallet', new.wallet, 'rupees', new.amount_rupees, 'note', new.note));
  end if;
  return new;
end $$;
drop trigger if exists wallet_entries_audit on public.wallet_entries;
create trigger wallet_entries_audit after insert on public.wallet_entries for each row execute function public.audit_wallet_adjust();

create or replace function public.audit_pass_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit (actor, action, subject, detail)
  values (auth.uid(), 'pass_added', new.driver_id, jsonb_build_object('kind', new.kind, 'rupees', new.amount_rupees, 'ends_at', new.ends_at, 'note', new.note));
  return new;
end $$;
drop trigger if exists driver_passes_audit on public.driver_passes;
create trigger driver_passes_audit after insert on public.driver_passes for each row execute function public.audit_pass_added();

create or replace function public.audit_kyc_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kyc_status is distinct from old.kyc_status then
    insert into public.admin_audit (actor, action, subject, detail)
    values (auth.uid(), 'kyc_changed', new.id, jsonb_build_object('from', old.kyc_status, 'to', new.kyc_status, 'note', new.kyc_note));
  end if;
  return new;
end $$;
drop trigger if exists drivers_kyc_audit on public.drivers;
create trigger drivers_kyc_audit after update of kyc_status on public.drivers for each row execute function public.audit_kyc_change();

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit (actor, action, detail)
  values (auth.uid(), tg_argv[0], jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  return new;
end $$;
drop trigger if exists referral_rules_audit on public.referral_rules;
create trigger referral_rules_audit after update on public.referral_rules for each row execute function public.audit_row_change('rule_changed');
drop trigger if exists settings_audit on public.settings;
create trigger settings_audit after update on public.settings for each row execute function public.audit_row_change('settings_changed');

-- ---------------------------------------------------------------------------
-- Ledger values cannot be rewritten
-- ---------------------------------------------------------------------------
create or replace function public.wallet_entries_guard() returns trigger language plpgsql as $$
begin
  if (old.user_id, old.wallet, old.amount_rupees, old.kind, old.job_id, old.ref_user, old.created_at)
     is distinct from (new.user_id, new.wallet, new.amount_rupees, new.kind, new.job_id, new.ref_user, new.created_at) then
    raise exception 'wallet entries cannot be edited; add a correction instead';
  end if;
  return new;
end $$;
drop trigger if exists wallet_entries_no_edit on public.wallet_entries;
create trigger wallet_entries_no_edit before update on public.wallet_entries for each row execute function public.wallet_entries_guard();

-- ---------------------------------------------------------------------------
-- Referral rewards ignore trips between the referrer and the referred person
-- ---------------------------------------------------------------------------
create or replace function public.referral_step(p_user uuid, p_wallet text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.referrals; rule public.referral_rules; v_n integer; v_created timestamptz;
begin
  select * into r from public.referrals where referred_id = p_user and wallet = p_wallet and status = 'pending';
  if r.id is not null then
    -- Only deliveries with other people count: a referrer cannot ride or drive for their own referral to unlock the reward.
    v_n := case when p_wallet = 'driver'
      then (select count(*) from public.jobs where driver_id = p_user and status = 'delivered' and customer_id <> r.referrer_id)
      else (select count(*) from public.jobs where customer_id = p_user and status = 'delivered' and driver_id is distinct from r.referrer_id) end;
    select * into rule from public.referral_rules where flow = r.flow;
    if rule.flow is null or not rule.enabled or v_n >= rule.trips then perform public.referral_payout(r.id); end if;
    return;
  end if;

  v_n := case when p_wallet = 'driver'
    then (select count(*) from public.jobs where driver_id = p_user and status = 'delivered')
    else (select count(*) from public.jobs where customer_id = p_user and status = 'delivered') end;
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
revoke execute on function public.referral_step(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- People: wallet and activity per driver or customer
-- ---------------------------------------------------------------------------
create or replace function public.phone_digits(p text) returns bigint language sql immutable as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')::bigint $$;

create or replace function public.admin_people(p_kind text)
returns table (id uuid, code text, name text, phone text, joined timestamptz, last_seen timestamptz,
               wallet_balance integer, wallet_given integer, wallet_spent integer,
               trips_done bigint, trips_cancelled bigint, referrals_made bigint, referrals_paid bigint,
               pass_ends timestamptz, kyc text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_kind = 'driver' then
    return query
    select d.id, d.driver_code, d.full_name, d.phone, d.created_at, d.last_seen_at,
      coalesce((select sum(e.amount_rupees) from public.wallet_entries e where e.user_id = d.id and e.wallet = 'driver'), 0)::int,
      coalesce((select sum(e.amount_rupees) from public.wallet_entries e where e.user_id = d.id and e.wallet = 'driver' and e.amount_rupees > 0), 0)::int,
      coalesce(-(select sum(e.amount_rupees) from public.wallet_entries e where e.user_id = d.id and e.wallet = 'driver' and e.amount_rupees < 0), 0)::int,
      (select count(*) from public.jobs j where j.driver_id = d.id and j.status = 'delivered'),
      (select count(*) from public.job_driver_cancellations c where c.driver_id = d.id),
      (select count(*) from public.referrals r where r.referrer_id = d.id),
      (select count(*) from public.referrals r where r.referrer_id = d.id and r.status = 'rewarded'),
      (select max(ps.ends_at) from public.driver_passes ps where ps.driver_id = d.id),
      d.kyc_status::text
    from public.drivers d order by d.created_at desc;
  else
    return query
    select p.id, p.referral_code, p.full_name, p.phone, p.created_at, (select max(j.created_at) from public.jobs j where j.customer_id = p.id),
      coalesce((select sum(e.amount_rupees) from public.wallet_entries e where e.user_id = p.id and e.wallet = 'customer'), 0)::int,
      coalesce((select sum(e.amount_rupees) from public.wallet_entries e where e.user_id = p.id and e.wallet = 'customer' and e.amount_rupees > 0), 0)::int,
      coalesce(-(select sum(e.amount_rupees) from public.wallet_entries e where e.user_id = p.id and e.wallet = 'customer' and e.amount_rupees < 0), 0)::int,
      (select count(*) from public.jobs j where j.customer_id = p.id and j.status = 'delivered'),
      (select count(*) from public.jobs j where j.customer_id = p.id and j.status = 'cancelled'),
      (select count(*) from public.referrals r where r.referrer_id = p.id),
      (select count(*) from public.referrals r where r.referrer_id = p.id and r.status = 'rewarded'),
      null::timestamptz, null::text
    from public.profiles p
    where not p.is_admin and not exists (select 1 from public.drivers d where d.id = p.id)
    order by p.created_at desc;
  end if;
end $$;
grant execute on function public.admin_people(text) to authenticated;

create or replace function public.admin_person_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'is_admin' from public.profiles p where p.id = p_id),
    'driver', (select to_jsonb(d) - 'kyc_docs' from public.drivers d where d.id = p_id),
    'wallet', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.wallet_entries where user_id = p_id order by created_at desc limit 300) e), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(to_jsonb(ps) order by ps.created_at desc) from (select * from public.driver_passes where driver_id = p_id order by created_at desc limit 100) ps), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at desc) from (
        select id, status, created_at, accepted_at, delivered_at, distance_m, fare_rupees, wallet_discount, paid_via, customer_id, driver_id, pickup_address, drop_address
        from public.jobs where customer_id = p_id or driver_id = p_id order by created_at desc limit 100) j), '[]'::jsonb),
    'referred_by', (select to_jsonb(r) from public.referrals r where r.referred_id = p_id limit 1),
    'referred', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.referrals r where r.referrer_id = p_id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc) from (select * from public.admin_audit where subject = p_id order by at desc limit 50) a), '[]'::jsonb)
  ) into v;
  return v;
end $$;
grant execute on function public.admin_person_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Watchlist: patterns that look like cheating. Nothing is blocked automatically; an admin decides.
-- ---------------------------------------------------------------------------
create or replace function public.admin_risk_flags()
returns table (rule text, severity text, subject_id uuid, subject_name text, detail text, rupees integer, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return query
  with names as (
    select p.id, coalesce(nullif(d.full_name, ''), nullif(p.full_name, ''), p.phone, left(p.id::text, 8)) as nm
    from public.profiles p left join public.drivers d on d.id = p.id
  ), f as (
  -- 1. Rewards unlocked mostly by trips between the two people
  select 'Circular trips'::text as rule, 'high'::text as severity, r.referrer_id as subject_id, (select nm from names where names.id = r.referrer_id) as subject_name,
    'Reward paid for ' || (select nm from names where names.id = r.referred_id) || ', but ' || x.pair || ' of their ' || x.total || ' deliveries were with the referrer.' as detail,
    coalesce((select e.amount_rupees from public.wallet_entries e where e.user_id = r.referrer_id and e.kind = 'referral_reward' and e.ref_user = r.referred_id limit 1), 0)::int as rupees,
    r.rewarded_at as at
  from public.referrals r
  cross join lateral (
    select count(*) filter (where (j.customer_id = r.referred_id and j.driver_id = r.referrer_id) or (j.driver_id = r.referred_id and j.customer_id = r.referrer_id)) as pair,
           count(*) as total
    from public.jobs j where j.status = 'delivered' and (j.customer_id = r.referred_id or j.driver_id = r.referred_id)) x
  where r.status = 'rewarded' and x.total > 0 and x.pair * 2 >= x.total

  union all
  -- 2. Many referrals in one day
  select 'Referral burst', 'medium', r.referrer_id, (select nm from names where names.id = r.referrer_id),
    count(*) || ' people were referred in the last 24 hours.', 0, max(r.created_at)
  from public.referrals r where r.created_at > now() - interval '24 hours'
  group by r.referrer_id having count(*) >= 5

  union all
  -- 3. Referred accounts with phone numbers in a row
  select 'Phone numbers in a row', 'high', q.referrer_id, (select nm from names where names.id = q.referrer_id),
    q.n || ' of the people referred have phone numbers within 5 of each other. These may be accounts made by one person.', 0, q.last_at
  from (
    select a.referrer_id, count(distinct a.referred_id) as n, max(a.created_at) as last_at
    from public.referrals a
    join public.profiles pa on pa.id = a.referred_id
    join public.referrals b on b.referrer_id = a.referrer_id and b.referred_id <> a.referred_id
    join public.profiles pb on pb.id = b.referred_id
    where abs(coalesce(public.phone_digits(pa.phone), 0) - coalesce(public.phone_digits(pb.phone), 0)) <= 5
    group by a.referrer_id) q
  where q.n >= 3

  union all
  -- 4. Referrer and referred phone numbers almost the same
  select 'Same-looking phone numbers', 'high', r.referrer_id, (select nm from names where names.id = r.referrer_id),
    'The referrer and ' || (select nm from names where names.id = r.referred_id) || ' have phone numbers within 5 of each other.', 0, r.created_at
  from public.referrals r
  join public.profiles a on a.id = r.referrer_id join public.profiles b on b.id = r.referred_id
  where public.phone_digits(a.phone) is not null and public.phone_digits(b.phone) is not null
    and abs(public.phone_digits(a.phone) - public.phone_digits(b.phone)) <= 5

  union all
  -- 5. One customer funnels wallet credit to one driver (the driver is paid the discount by Pikop)
  select 'Wallet credit to one driver', 'high', j.customer_id, (select nm from names where names.id = j.customer_id),
    count(*) || ' trips with the same driver (' || (select nm from names where names.id = j.driver_id) || ') used wallet credit in 30 days, ₹' || sum(j.wallet_discount) || ' paid to that driver by Pikop.',
    sum(j.wallet_discount)::int, max(j.delivered_at)
  from public.jobs j
  where j.status = 'delivered' and j.wallet_discount > 0 and j.delivered_at > now() - interval '30 days' and j.driver_id is not null
  group by j.customer_id, j.driver_id having count(*) >= 3

  union all
  -- 6. Deliveries finished far too fast
  select 'Too-fast deliveries', 'medium', j.driver_id, (select nm from names where names.id = j.driver_id),
    count(*) || ' deliveries of 1.5 km or more were finished less than 2 minutes after being accepted.', 0, max(j.delivered_at)
  from public.jobs j
  where j.status = 'delivered' and j.accepted_at is not null and j.delivered_at - j.accepted_at < interval '2 minutes' and j.distance_m >= 1500
  group by j.driver_id having count(*) >= 2

  union all
  -- 7. Big manual wallet changes
  select 'Large manual adjustment', 'low', e.user_id, (select nm from names where names.id = e.user_id),
    'Wallet adjusted by ₹' || e.amount_rupees || ' (' || coalesce(e.note, 'no reason') || ').', e.amount_rupees, e.created_at
  from public.wallet_entries e
  where e.kind = 'admin_adjust' and abs(e.amount_rupees) >= 500 and e.created_at > now() - interval '30 days'

  union all
  -- 8. Customers who cancel most of what they book
  select 'Frequent cancellations', 'low', j.customer_id, (select nm from names where names.id = j.customer_id),
    count(*) filter (where j.status = 'cancelled') || ' of ' || count(*) || ' bookings were cancelled.', 0, max(j.created_at)
  from public.jobs j group by j.customer_id
  having count(*) filter (where j.status = 'cancelled') >= 5 and count(*) filter (where j.status = 'cancelled') * 10 >= count(*) * 6

  union all
  -- 9. Unusually large unused credit
  select 'Large wallet balance', 'low', e.user_id, (select nm from names where names.id = e.user_id),
    'Holds ₹' || sum(e.amount_rupees) || ' in the ' || e.wallet || ' wallet.', sum(e.amount_rupees)::int, max(e.created_at)
  from public.wallet_entries e group by e.user_id, e.wallet having sum(e.amount_rupees) >= 1000

  )
  select f.rule, f.severity, f.subject_id, f.subject_name, f.detail, f.rupees, f.at from f
  order by case f.severity when 'high' then 1 when 'medium' then 2 else 3 end, f.at desc nulls last;
end $$;
grant execute on function public.admin_risk_flags() to authenticated;
