-- Admin oversight (migration 0018). Runs last.
\set ON_ERROR_STOP on
reset role;
-- as an admin
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
do $$ declare n int; v jsonb; begin
  select count(*) into n from public.admin_people('driver'); assert n >= 1, 'drivers listed';
  select count(*) into n from public.admin_people('customer'); assert n >= 1, 'customers listed';
  v := public.admin_person_detail('00000000-0000-0000-0000-00000000000d');
  assert v ? 'wallet' and v ? 'jobs' and v ? 'audit', 'detail has sections';
  perform * from public.admin_risk_flags();
end $$;
-- a normal user is refused
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  begin perform public.admin_people('driver'); raise exception 'FAIL: user saw people';
  exception when others then if sqlerrm not like '%admin only%' then raise; end if; end;
  begin perform * from public.admin_risk_flags(); raise exception 'FAIL: user saw flags';
  exception when others then if sqlerrm not like '%admin only%' then raise; end if; end;
end $$;
reset role;
-- ledger values cannot be rewritten, audit cannot be edited
do $$ begin
  begin update public.wallet_entries set amount_rupees = amount_rupees + 1 where id = (select id from public.wallet_entries limit 1); raise exception 'FAIL: edited ledger';
  exception when others then if sqlerrm not like '%cannot be edited%' then raise; end if; end;
  begin update public.admin_audit set action = 'x'; raise exception 'FAIL: edited audit';
  exception when others then if sqlerrm not like '%cannot be changed%' and sqlerrm not like 'FAIL%' then raise; end if; end;
end $$;
-- an admin wallet adjustment lands in the audit log
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select public.admin_adjust_wallet('00000000-0000-0000-0000-00000000000d', 'driver', 600, 'test bonus');
reset role;
do $$ begin
  assert exists (select 1 from public.admin_audit where action = 'wallet_adjust' and detail ->> 'note' = 'test bonus'), 'adjustment audited';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
do $$ begin assert exists (select 1 from public.admin_risk_flags() where rule = 'Large manual adjustment'), 'large adjustment flagged'; end $$;
reset role;

-- A referrer who rides for their own referral does not unlock the reward.
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000c1', '+919500000001'),
  ('00000000-0000-0000-0000-0000000000c2', '+919500000002');
insert into public.profiles (id, phone) values
  ('00000000-0000-0000-0000-0000000000c1', '+919500000001'),
  ('00000000-0000-0000-0000-0000000000c2', '+919500000002') on conflict do nothing;
insert into public.drivers (id, full_name, phone, vehicle_number, licence_number) values ('00000000-0000-0000-0000-0000000000c1', 'Ring driver', '+919500000001', 'KA09ZZ0003', '');
update public.referral_rules set enabled = true, referrer_reward = 70, referred_reward = 0, trips = 2, monthly_cap = 9 where flow = 'driver_customer';
insert into public.referrals (referrer_id, referred_id, wallet, flow) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'customer', 'driver_customer');
create function pg_temp.trip(c uuid, d uuid) returns public.jobs language plpgsql as $$
declare j public.jobs; begin
  select * into j from public.jobs where status = 'delivered' limit 1;
  j.id := gen_random_uuid(); j.tracking_token := md5(random()::text); j.customer_id := c; j.driver_id := d;
  j.distance_m := 5000; j.fare_rupees := 100; j.wallet_discount := 0; insert into public.jobs select j.*; return j; end $$;
do $$ declare j public.jobs; begin
  j := pg_temp.trip('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1');
  j := pg_temp.trip('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1');
  perform public.pay_referral_rewards_for(j);
  assert (select status from public.referrals where referred_id = '00000000-0000-0000-0000-0000000000c2') = 'pending', 'rides with the referrer must not count';
  j := pg_temp.trip('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000e');
  j := pg_temp.trip('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000e');
  perform public.pay_referral_rewards_for(j);
  assert (select status from public.referrals where referred_id = '00000000-0000-0000-0000-0000000000c2') = 'rewarded', 'rides with others count';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
do $$ begin assert exists (select 1 from public.admin_risk_flags() where subject_id = '00000000-0000-0000-0000-0000000000c1' and rule = 'Same-looking phone numbers'), 'adjacent phones flagged'; end $$;
reset role;
\echo 'OVERSIGHT CHECKS PASSED'
