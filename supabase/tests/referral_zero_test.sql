-- Zero allowed everywhere (migration 0017). Runs after referral_flows_test.sql.
\set ON_ERROR_STOP on
reset role;
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000b1', '+919400000001'),  -- customer who refers a driver
  ('00000000-0000-0000-0000-0000000000b2', '+919400000002');  -- driver who uses the code
insert into public.profiles (id, phone) values
  ('00000000-0000-0000-0000-0000000000b1', '+919400000001'),
  ('00000000-0000-0000-0000-0000000000b2', '+919400000002') on conflict do nothing;
insert into public.drivers (id, full_name, phone, vehicle_number, licence_number)
values ('00000000-0000-0000-0000-0000000000b2', 'Zero driver', '+919400000002', 'KA09ZZ0002', '');

-- Deliveries = 0 is accepted, and a referral under it pays the moment the code is added.
update public.referral_rules set enabled = true, referrer_reward = 40, referred_reward = 10, referred_when = 'trips', trips = 0, monthly_cap = 5 where flow = 'customer_driver';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
create temp table t_zcode as select public.my_referral_code() as code;
grant select on t_zcode to authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
do $$ begin perform public.apply_referral_code((select code from t_zcode), 'driver'); end $$;
reset role;
do $$ begin
  assert (select status from public.referrals where referred_id = '00000000-0000-0000-0000-0000000000b2') = 'rewarded', 'should settle at once';
  assert (select coalesce(sum(amount_rupees),0) from public.wallet_entries where user_id = '00000000-0000-0000-0000-0000000000b1' and kind = 'referral_reward') = 40, 'referrer paid 40';
  assert (select coalesce(sum(amount_rupees),0) from public.wallet_entries where user_id = '00000000-0000-0000-0000-0000000000b2' and kind = 'referral_welcome') = 10, 'new driver paid 10';
end $$;

-- Every other field may be 0 too.
update public.referral_rules set referrer_reward = 0, referred_reward = 0, monthly_cap = 0, trips = 0 where flow = 'customer_driver';

\echo 'REFERRAL ZERO CHECKS PASSED'
