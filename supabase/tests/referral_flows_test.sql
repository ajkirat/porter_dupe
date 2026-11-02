-- Referral flows (migration 0016). Runs after referral_plan_test.sql.
\set ON_ERROR_STOP on
reset role;
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000f1', '+919300000001'),  -- customer who refers a driver
  ('00000000-0000-0000-0000-0000000000f2', '+919300000002'),  -- driver referred by a customer
  ('00000000-0000-0000-0000-0000000000f3', '+919300000003');  -- customer who gets Pikop's own bonus
insert into public.profiles (id, phone) values
  ('00000000-0000-0000-0000-0000000000f1', '+919300000001'),
  ('00000000-0000-0000-0000-0000000000f2', '+919300000002'),
  ('00000000-0000-0000-0000-0000000000f3', '+919300000003') on conflict do nothing;
insert into public.drivers (id, full_name, phone, vehicle_number, licence_number)
values ('00000000-0000-0000-0000-0000000000f2', 'Referred driver', '+919300000002', 'KA09ZZ0001', '');

-- All six rules exist; only the two plan flows are on by default.
do $$ begin
  assert (select count(*) from public.referral_rules) = 6, 'six flows';
  assert (select enabled from public.referral_rules where flow = 'driver_driver'), 'driver_driver on';
  assert not (select enabled from public.referral_rules where flow = 'customer_driver'), 'customer_driver starts off';
end $$;

-- Customer -> driver: off means the code is refused; on, it works and pays both sides.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
set role authenticated;
create temp table t_fcode as select public.my_referral_code() as code;
grant select on t_fcode to authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$ begin
  begin perform public.apply_referral_code((select code from t_fcode), 'driver'); raise exception 'should be off';
  exception when others then if sqlerrm not like '%switched off%' then raise; end if; end;
end $$;
reset role;
update public.referral_rules set enabled = true, referrer_reward = 40, referred_reward = 10, referred_when = 'trips', trips = 1, monthly_cap = 5 where flow = 'customer_driver';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$ begin perform public.apply_referral_code((select code from t_fcode), 'driver'); end $$;
reset role;
do $$ declare j public.jobs; begin
  select * into j from public.jobs where status = 'delivered' limit 1;
  j.id := gen_random_uuid(); j.tracking_token := md5(random()::text); j.customer_id := '00000000-0000-0000-0000-0000000000f3';
  j.driver_id := '00000000-0000-0000-0000-0000000000f2'; j.distance_m := 5000; j.fare_rupees := 100; j.wallet_discount := 0;
  insert into public.jobs select j.*;
  perform public.pay_referral_rewards_for(j);
  perform public.pay_referral_rewards_for(j);   -- paying twice must not double
  assert (select coalesce(sum(amount_rupees),0) from public.wallet_entries where user_id = '00000000-0000-0000-0000-0000000000f1' and wallet = 'customer' and kind = 'referral_reward') = 40, 'customer referrer earns 40 once';
  assert (select coalesce(sum(amount_rupees),0) from public.wallet_entries where user_id = '00000000-0000-0000-0000-0000000000f2' and wallet = 'driver' and kind = 'referral_welcome') = 10, 'referred driver gets 10 once';
end $$;

-- Pikop -> customer: bonus after 3 deliveries (one already done above), once, only for people who joined after starts_at.
update public.referral_rules set enabled = true, referred_reward = 25, trips = 3, starts_at = now() - interval '1 day' where flow = 'pikop_customer';
do $$ declare j public.jobs; begin
  select * into j from public.jobs where status = 'delivered' limit 1;
  for i in 1..2 loop
    j.id := gen_random_uuid(); j.tracking_token := md5(random()::text); j.customer_id := '00000000-0000-0000-0000-0000000000f3';
    j.driver_id := '00000000-0000-0000-0000-00000000000e'; j.distance_m := 5000; j.fare_rupees := 100; j.wallet_discount := 0;
    insert into public.jobs select j.*;
    perform public.pay_referral_rewards_for(j);
    if i = 1 then assert not exists (select 1 from public.wallet_entries where user_id = '00000000-0000-0000-0000-0000000000f3' and kind = 'pikop_welcome'), 'bonus too early'; end if;
  end loop;
  perform public.pay_referral_rewards_for(j);
  assert (select count(*) from public.wallet_entries where user_id = '00000000-0000-0000-0000-0000000000f3' and kind = 'pikop_welcome') = 1, 'bonus exactly once';
  assert (select amount_rupees from public.wallet_entries where user_id = '00000000-0000-0000-0000-0000000000f3' and kind = 'pikop_welcome') = 25, 'bonus amount';
end $$;

-- The old settings columns follow the rules.
update public.referral_rules set referrer_reward = 175 where flow = 'driver_driver';
do $$ begin assert (select referral_driver_reward from public.settings) = 175, 'settings should follow rules'; end $$;

\echo 'REFERRAL FLOW CHECKS PASSED'
