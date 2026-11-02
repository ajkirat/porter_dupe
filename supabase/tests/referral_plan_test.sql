-- Referral rules from the business plan (migration 0015). Runs after referral_test.sql.
\set ON_ERROR_STOP on
reset role;
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000e1', '+919200000001'),  -- customer referred by a driver
  ('00000000-0000-0000-0000-0000000000e2', '+919200000002'),  -- customer referred by a customer
  ('00000000-0000-0000-0000-0000000000e3', '+919200000003');  -- customer who refers
insert into public.profiles (id, phone) values
  ('00000000-0000-0000-0000-0000000000e1', '+919200000001'),
  ('00000000-0000-0000-0000-0000000000e2', '+919200000002'),
  ('00000000-0000-0000-0000-0000000000e3', '+919200000003') on conflict do nothing;

-- Defaults moved to the plan's values.
do $$ declare s public.settings; begin
  select * into s from public.settings;
  assert s.referral_driver_reward = 150 and s.referral_max_driver = 3, 'driver reward should be 150, cap 3';
  assert s.referral_customer_reward = 50 and s.referral_customer_welcome = 0, 'customer rules';
  assert s.referral_driver_trips = 5 and s.referral_customer_trips = 3, 'trip thresholds';
end $$;

create function pg_temp.bal(u uuid, w text) returns int language sql as $$
  select coalesce(sum(amount_rupees), 0)::int from public.wallet_entries where user_id = u and wallet = w $$;

-- Helper: add a delivered trip for a customer by copying an existing one.
create function pg_temp.add_trip(p_customer uuid, p_driver uuid) returns public.jobs language plpgsql as $$
declare j public.jobs;
begin
  select * into j from public.jobs where status = 'delivered' limit 1;
  j.id := gen_random_uuid(); j.customer_id := p_customer; j.driver_id := p_driver;
  j.tracking_token := md5(random()::text);
  j.distance_m := 5000; j.fare_rupees := 100; j.wallet_discount := 0;
  insert into public.jobs select j.*;
  return j;
end $$;

-- Driver D refers customer e1: nothing after 2 trips, Rs 50 driver credit after the 3rd.
insert into public.referrals (referrer_id, referred_id, wallet) values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000e1', 'customer');
do $$ declare j public.jobs; b int; begin
  b := pg_temp.bal('00000000-0000-0000-0000-00000000000d', 'driver');
  j := pg_temp.add_trip('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000e'); perform public.pay_referral_rewards_for(j);
  j := pg_temp.add_trip('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000e'); perform public.pay_referral_rewards_for(j);
  assert pg_temp.bal('00000000-0000-0000-0000-00000000000d', 'driver') = b, 'paid too early';
  j := pg_temp.add_trip('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000e'); perform public.pay_referral_rewards_for(j);
  assert pg_temp.bal('00000000-0000-0000-0000-00000000000d', 'driver') = b + 50, 'driver should earn 50';
  perform public.pay_referral_rewards_for(j);
  assert pg_temp.bal('00000000-0000-0000-0000-00000000000d', 'driver') = b + 50, 'paid twice';
end $$;

-- A customer who refers a customer earns nothing.
insert into public.referrals (referrer_id, referred_id, wallet) values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e2', 'customer');
do $$ declare j public.jobs; begin
  for i in 1..3 loop j := pg_temp.add_trip('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000e'); end loop;
  perform public.pay_referral_rewards_for(j);
  assert pg_temp.bal('00000000-0000-0000-0000-0000000000e3', 'customer') = 0, 'customer earned for referring';
  assert (select status from public.referrals where referred_id = '00000000-0000-0000-0000-0000000000e2') = 'capped', 'should be closed without reward';
end $$;

\echo 'REFERRAL PLAN CHECKS PASSED'
