-- Referral codes, wallet credit, redeeming on trips and passes.
-- Runs after flow_test.sql on the same database (see run.sh).
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1', '+919100000001'),  -- customer X1 (referrer)
  ('00000000-0000-0000-0000-0000000000a2', '+919100000002'),  -- customer X2 (referred)
  ('00000000-0000-0000-0000-0000000000a3', '+919100000003'),  -- customer X3 (referred, over the cap)
  ('00000000-0000-0000-0000-0000000000a4', '+919100000004'),  -- driver F (referred by driver D from flow_test)
  ('00000000-0000-0000-0000-0000000000a5', '+919100000005'),  -- driver G (second driver for the cap check)
  ('00000000-0000-0000-0000-0000000000a6', '+919100000006');  -- customer X4 (for the minimum-trip condition)

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
create function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error containing "%" but statement succeeded: %', needle, sql;
exception when others then
  if sqlerrm not like '%' || needle || '%' then raise; end if;
end $$;
-- Accept, pick up and deliver a job as the given driver (reads the OTPs the way the sender and receiver would).
create function pg_temp.run_trip(p_job uuid, p_driver text) returns void language plpgsql security definer as $$
declare v_pick text; v_drop text;
begin
  select pickup_otp, drop_otp into v_pick, v_drop from public.job_secrets where job_id = p_job;
  perform set_config('request.jwt.claim.sub', p_driver, false);
  perform public.accept_job(p_job);
  perform public.mark_picked_up(p_job, v_pick);
  perform public.mark_delivered(p_job, v_drop);
end $$;

set role authenticated;

-- ---------------------------------------------------------------------------
-- Customer referral
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
create temp table t_code as select public.my_referral_code() as code;
grant select on t_code to authenticated;
do $$ begin
  assert (select length(code) from t_code) = 6, 'code should be 6 characters';
  assert public.my_referral_code() = (select code from t_code), 'code should not change';
  assert public.my_wallet('customer') = 0, 'new wallet should be empty';
end $$;
select pg_temp.expect_error($$select public.apply_referral_code((select code from t_code), 'customer')$$, 'your own code');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error($$select public.apply_referral_code('NOSUCH', 'customer')$$, 'not found');
do $$ begin assert public.apply_referral_code(lower((select code from t_code)), 'customer') = 50, 'welcome credit'; end $$;
do $$ begin assert public.my_wallet('customer') = 50, 'welcome credit not in wallet'; end $$;
select pg_temp.expect_error($$select public.apply_referral_code((select code from t_code), 'customer')$$, 'already used');

-- A customer who has already booked cannot claim a referral later.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$select public.apply_referral_code((select code from t_code), 'customer')$$, 'before your first booking');

-- Wallet entries cannot be written or read across users.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error($$insert into public.wallet_entries (user_id, wallet, amount_rupees, kind) values (auth.uid(), 'customer', 999, 'admin_adjust')$$, 'row-level security');
do $$ begin
  assert (select count(*) from public.wallet_entries) = 1, 'should see only own entries';
  assert public.wallet_balance('00000000-0000-0000-0000-0000000000a1', 'customer') is null, 'balance of another user leaked';
end $$;

-- Booking with credit: at most half the fare, and the amount is taken from the wallet.
create temp table t_j1 as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408,
                                  'Meera', '+919000000009', 5000, 900, 'Documents', p_use_wallet => true);
grant select on t_j1 to authenticated;
do $$ declare j record; begin
  select * into j from t_j1;
  assert j.wallet_discount = floor(j.fare_rupees / 2.0), format('discount %s of fare %s', j.wallet_discount, j.fare_rupees);
  assert j.wallet_discount < 50, 'test expects the 50% cap to bite';
  assert public.my_wallet('customer') = 50 - j.wallet_discount, 'wallet not reduced';
  assert (select wallet_discount from public.get_tracking(j.tracking_token)) = j.wallet_discount, 'tracking should show discount';
end $$;

-- A cancelled trip returns the credit; cancelling twice cannot pay twice.
create temp table t_j2 as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408,
                                  'Meera', '+919000000009', 5000, 900, p_use_wallet => true);
grant select on t_j2 to authenticated;
do $$ declare before_bal integer; begin
  assert (select wallet_discount from t_j2) > 0, 'second trip should use remaining credit';
  select 50 - (select wallet_discount from t_j1) - (select wallet_discount from t_j2) into before_bal;
  assert public.my_wallet('customer') = before_bal, 'second discount not taken';
end $$;
select public.cancel_job((select id from t_j2));
do $$ begin assert public.my_wallet('customer') = 50 - (select wallet_discount from t_j1), 'cancel did not refund'; end $$;
select pg_temp.expect_error(format('select public.cancel_job(%L)', (select id from t_j2)), 'cannot be cancelled');

-- Setup for the pass checks: second driver A gets approved and a pass.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
insert into public.drivers (id, full_name, phone, vehicle_number, licence_number)
values ('00000000-0000-0000-0000-0000000000a4', 'Farhan', '+919100000004', 'KA03EF9012', '');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
insert into public.drivers (id, full_name, phone, vehicle_number, licence_number)
values ('00000000-0000-0000-0000-0000000000a5', 'Gopal', '+919100000005', 'KA04GH3456', '');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.drivers set kyc_status = 'approved';
select public.admin_add_pass('00000000-0000-0000-0000-0000000000a4', 'daily');
select public.admin_add_pass('00000000-0000-0000-0000-0000000000a5', 'daily');

-- Delivering the first trip pays the referrer once, and compensates the driver for the discount.
reset role;
select pg_temp.run_trip((select id from t_j1), '00000000-0000-0000-0000-00000000000e');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert public.my_wallet('customer') = 50, 'referrer should be paid 50 after the first trip';
  assert (select status from public.my_referrals('customer')) = 'rewarded', 'referral not marked rewarded';
  assert (select reward from public.my_referrals('customer')) = 50, 'reward amount';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
do $$ begin assert public.my_wallet('driver') = (select wallet_discount from t_j1), 'driver not compensated for the discount'; end $$;

-- Over the cap: the referrer's limit is reached, so the next friend gets welcome credit but the referrer is not paid.
reset role;
update public.settings set referral_max_customer = 1;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.apply_referral_code((select code from t_code), 'customer');
create temp table t_j3 as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408, 'Meera', '+919000000009', 5000, 900);
grant select on t_j3 to authenticated;
reset role;
select pg_temp.run_trip((select id from t_j3), '00000000-0000-0000-0000-0000000000a5');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert public.my_wallet('customer') = 50, 'capped referral should not pay';
  assert (select count(*) from public.my_referrals('customer') where status = 'capped') = 1, 'capped referral not marked';
end $$;
reset role;
update public.settings set referral_max_customer = 5;
set role authenticated;

-- Condition: a first trip shorter than the admin's minimum does not pay the referrer.
reset role;
update public.settings set referral_min_trip_m = 99999999;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
select public.apply_referral_code((select code from t_code), 'customer');
create temp table t_j5 as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408, 'Meera', '+919000000009', 5000, 900);
grant select on t_j5 to authenticated;
reset role;
select pg_temp.run_trip((select id from t_j5), '00000000-0000-0000-0000-0000000000a5');
update public.settings set referral_min_trip_m = 1000;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert public.my_wallet('customer') = 50, 'trip below the minimum should not pay the referrer';
  assert (select count(*) from public.my_referrals('customer') where status = 'pending') = 1, 'referral should stay waiting';
end $$;

-- ---------------------------------------------------------------------------
-- Driver referral + paying for a pass with the wallet
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');   -- driver D from flow_test
create temp table t_dcode as select public.my_referral_code() as code;
grant select on t_dcode to authenticated;
do $$ begin assert public.my_wallet('driver') = 0, 'driver D starts with an empty wallet'; end $$;
-- The driver wallet and the customer wallet are separate.
do $$ begin assert public.my_wallet('customer') = 0, 'customer wallet should be separate'; end $$;

-- A customer code cannot be used to refer a driver; a driver cannot refer someone who already delivered.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
select pg_temp.expect_error($$select public.apply_referral_code((select code from t_code), 'driver')$$, 'does not belong to a driver');
select pg_temp.expect_error($$select public.apply_referral_code((select code from t_dcode), 'driver')$$, 'before your first delivery');

-- Driver F uses D's code before delivering anything; drivers get no welcome credit.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
do $$ begin
  assert public.apply_referral_code((select code from t_dcode), 'driver') = 0, 'drivers get no welcome credit';
  assert public.my_wallet('driver') = 0, 'F wallet unchanged by applying';
end $$;
select pg_temp.expect_error($$select public.apply_referral_code((select code from t_dcode), 'driver')$$, 'already used');

-- Conditions: switch driver referrals off and a new driver cannot use a code; switch back on after.
reset role;
update public.settings set referral_driver_enabled = false;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
select pg_temp.expect_error($$select public.apply_referral_code((select code from t_dcode), 'driver')$$, 'switched off');
reset role;
update public.settings set referral_driver_enabled = true;
set role authenticated;

-- F's first delivered trip pays D 50.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
create temp table t_jpay as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408, 'Meera', '+919000000009', 5000, 900);
grant select on t_jpay to authenticated;
reset role;
-- a one-off short hop would not count, but this is a 5 km trip
select pg_temp.run_trip((select id from t_jpay), '00000000-0000-0000-0000-0000000000a4');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert public.my_wallet('driver') = 50, 'driver referrer should have 50';
  assert (select status from public.my_referrals('driver')) = 'rewarded', 'driver referral not rewarded';
end $$;

-- D cannot afford a pass yet (50 < 75); top up by admin, then pay from the wallet.
select pg_temp.expect_error($$select public.driver_buy_pass_with_wallet('daily')$$, 'Not enough');
select pg_temp.expect_error($$select public.admin_adjust_wallet(auth.uid(), 'driver', 100, 'self-service')$$, 'admins only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.admin_adjust_wallet('00000000-0000-0000-0000-00000000000d', 'driver', 100, '')$$, 'reason is required');
select pg_temp.expect_error($$select public.admin_adjust_wallet('00000000-0000-0000-0000-00000000000d', 'driver', -500, 'oops')$$, 'below zero');
select public.admin_adjust_wallet('00000000-0000-0000-0000-00000000000d', 'driver', 50, 'goodwill');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ declare ends_before timestamptz; begin
  select max(ends_at) into ends_before from public.driver_passes where driver_id = auth.uid();
  perform public.driver_buy_pass_with_wallet('daily');
  assert public.my_wallet('driver') = 25, 'pass price not taken from wallet';
  assert (select max(ends_at) from public.driver_passes where driver_id = auth.uid()) = ends_before + interval '1 day', 'pass not stacked';
end $$;
select pg_temp.expect_error($$select public.driver_buy_pass_with_wallet('daily')$$, 'Not enough');

-- Admin applies part of the wallet to a weekly pass that was mostly paid by UPI.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.admin_add_pass('00000000-0000-0000-0000-00000000000d', 'weekly', null, 30)$$, 'does not have that much');
select pg_temp.expect_error($$select public.admin_add_pass('00000000-0000-0000-0000-00000000000d', 'weekly', null, 9999)$$, 'between 0 and the pass price');
select public.admin_add_pass('00000000-0000-0000-0000-00000000000d', 'weekly', 'UPI 475 + wallet 25', 25);
do $$ begin
  assert public.wallet_balance('00000000-0000-0000-0000-00000000000d', 'driver') = 0, 'admin wallet use not debited';
  assert (select count(*) from public.wallet_entries where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'pass_payment') = 2, 'ledger rows';
end $$;

-- Admin can read referrals; the ledger always adds up to the balance.
do $$ begin
  assert (select count(*) from public.referrals) = 4, 'admin should see all referrals';
  assert (select sum(amount_rupees) from public.wallet_entries where user_id = '00000000-0000-0000-0000-00000000000d' and wallet = 'driver') = 0, 'ledger mismatch';
end $$;

-- Saved routes: private to their owner, capped at 20.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.saved_routes (label, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng)
values ('Shop to home', 'A', 12.9, 77.6, 'B', 12.95, 77.65);
do $$ begin assert (select count(*) from public.saved_routes) = 1, 'owner should see their route'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin assert (select count(*) from public.saved_routes) = 0, 'routes leaked to another user'; end $$;
select pg_temp.expect_error($$insert into public.saved_routes (user_id, label, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng) values ('00000000-0000-0000-0000-0000000000a1', 'x', 'A', 1, 1, 'B', 2, 2)$$, 'row-level security');
do $$ begin
  for i in 1..20 loop
    insert into public.saved_routes (label, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng)
    values ('r' || i, 'A', 12.9, 77.6, 'B', 12.95, 77.65);
  end loop;
end $$;
select pg_temp.expect_error($$insert into public.saved_routes (label, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng) values ('21st', 'A', 1, 1, 'B', 2, 2)$$, 'up to 20');

-- Driver IDs and bulk credit.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select count(distinct driver_code) from public.drivers) = (select count(*) from public.drivers), 'driver codes not unique';
  assert (select bool_and(driver_code ~ '^PK[0-9]{4,}$') from public.drivers), 'driver code format';
end $$;
do $$ declare before_d integer; before_e integer; begin
  before_d := public.wallet_balance('00000000-0000-0000-0000-00000000000d', 'driver');
  before_e := public.wallet_balance('00000000-0000-0000-0000-00000000000e', 'driver');
  assert public.admin_bulk_wallet_credit(array['00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-00000000000d']::uuid[], 40, 'Launch bonus') = 2, 'duplicates should count once';
  assert public.wallet_balance('00000000-0000-0000-0000-00000000000d', 'driver') = before_d + 40, 'D not credited';
  assert public.wallet_balance('00000000-0000-0000-0000-00000000000e', 'driver') = before_e + 40, 'E not credited';
end $$;
select pg_temp.expect_error($$select public.admin_bulk_wallet_credit(array['00000000-0000-0000-0000-00000000000d']::uuid[], -5, 'x')$$, 'between 1 and 10000');
select pg_temp.expect_error($$select public.admin_bulk_wallet_credit(array['00000000-0000-0000-0000-00000000000d']::uuid[], 5, '')$$, 'reason is required');
select pg_temp.expect_error($$select public.admin_bulk_wallet_credit(array[gen_random_uuid()], 5, 'x')$$, 'no matching drivers');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.admin_bulk_wallet_credit(array['00000000-0000-0000-0000-00000000000d']::uuid[], 500, 'self')$$, 'admins only');

-- Auto-renew from the wallet. Driver F's daily pass is made to have expired.
reset role;
update public.driver_passes set starts_at = starts_at - interval '3 days', ends_at = ends_at - interval '3 days' where driver_id = '00000000-0000-0000-0000-0000000000a4';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
do $$ begin
  assert not public.has_active_pass(auth.uid()), 'F pass should have expired';
  assert public.driver_auto_renew() is null, 'no credit yet: nothing to renew';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_adjust_wallet('00000000-0000-0000-0000-0000000000a4', 'driver', 100, 'bonus');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select public.driver_set_auto_renew(false);
do $$ begin assert public.driver_auto_renew() is null, 'opted out: must not renew'; end $$;
select public.driver_set_auto_renew(true);
do $$ declare p public.driver_passes; begin
  p := public.driver_auto_renew();
  assert p.id is not null and p.kind = 'daily', 'daily pass should auto-renew';
  assert public.has_active_pass(auth.uid()), 'pass should be active again';
  assert public.my_wallet('driver') = 100 - 75, 'price not taken';
  assert public.driver_auto_renew() is null, 'must not renew twice';
end $$;

-- Credit expiry, first in first out.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
do $$ begin assert public.my_wallet('driver') = 0, 'G starts empty for the expiry check'; end $$;
reset role;
update public.settings set wallet_expiry_days = 30;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_adjust_wallet('00000000-0000-0000-0000-0000000000a5', 'driver', 50, 'A');   -- will lapse
select public.admin_adjust_wallet('00000000-0000-0000-0000-0000000000a5', 'driver', 80, 'B');
reset role;
update public.wallet_entries set expires_at = now() - interval '1 day' where note = 'A';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
do $$ begin
  assert public.my_wallet('driver') = 80, 'lapsed credit must not count';
  assert (select amount from public.my_wallet_expiring('driver')) = 80, 'next expiry amount';
  assert (select expires_at from public.my_wallet_expiring('driver')) > now() + interval '29 days', 'expiry date';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_adjust_wallet('00000000-0000-0000-0000-0000000000a5', 'driver', -30, 'spend');   -- must come out of B, not the lapsed A
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
do $$ begin assert public.my_wallet('driver') = 50, 'spend should come from live credit'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.admin_adjust_wallet('00000000-0000-0000-0000-0000000000a5', 'driver', -60, 'too much')$$, 'below zero');
reset role;
update public.settings set wallet_expiry_days = 0;
set role authenticated;

-- Pay on delivery: payment can be noted only after the trip is delivered; earnings never depend on it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
create temp table t_jpayx as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408, 'Meera', '+919000000009', 5000, 900);
grant select on t_jpayx to authenticated;
select pg_temp.expect_error($$select public.customer_mark_paid((select id from t_jpayx), 'upi')$$, 'cannot be marked');
reset role;
select pg_temp.run_trip((select id from t_jpayx), '00000000-0000-0000-0000-0000000000a5');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$select public.customer_mark_paid((select id from t_jpayx), 'cash')$$, 'cannot be marked');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
select pg_temp.expect_error($$select public.customer_mark_paid((select id from t_jpayx), 'bitcoin')$$, 'unknown payment method');
select public.customer_mark_paid((select id from t_jpayx), 'upi');
do $$ begin assert (select paid_via from public.jobs where id = (select id from t_jpayx)) = 'upi', 'paid_via not saved'; end $$;

-- Vehicle types: own fare, and a job reaches only drivers with that vehicle.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
do $$ begin
  assert public.compute_fare(10000, 'tata_ace') = 220 + 8 * 22, 'tata ace fare';
  assert public.compute_fare(10000, 'bike') = public.compute_fare(10000), 'bike fare unchanged';
end $$;
select pg_temp.expect_error($$select public.compute_fare(5000, 'rocket')$$, 'not available');
create temp table t_jveh as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408, 'Meera', '+919000000009', 5000, 900, p_vehicle_type => 'tata_ace');
grant select on t_jveh to authenticated;
do $$ begin assert (select fare_rupees from t_jveh) = public.compute_fare(5000, 'tata_ace') or (select fare_rupees from t_jveh) >= 220, 'job fare uses vehicle'; end $$;
reset role;
update public.drivers set is_online = true, last_lat = 12.9352, last_lng = 77.6245 where id = '00000000-0000-0000-0000-0000000000a4';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
do $$ begin
  assert not exists (select 1 from public.driver_open_jobs(12.9352, 77.6245) where id = (select id from t_jveh)), 'bike driver must not see a Tata Ace job';
end $$;
select pg_temp.expect_error($$select public.accept_job((select id from t_jveh))$$, 'no longer available');
reset role;
update public.drivers set vehicle_type = 'tata_ace' where id = '00000000-0000-0000-0000-0000000000a4';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
do $$ begin
  assert exists (select 1 from public.driver_open_jobs(12.9352, 77.6245) where id = (select id from t_jveh)), 'Tata Ace driver should see it';
end $$;

-- Account deletion: blocked with an open trip; otherwise blanks the person, keeps the trip, disables the login.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
create temp table t_jdel as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408, 'Meera', '+919000000009', 5000, 900);
grant select on t_jdel to authenticated;
select pg_temp.expect_error($$select public.delete_my_account()$$, 'open trip');
select public.cancel_job((select id from t_jdel));
select public.delete_my_account();
reset role;
do $$ begin
  assert (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = 'Deleted user', 'profile not blanked';
  assert (select banned_until from auth.users where id = '00000000-0000-0000-0000-0000000000a2') is not null, 'login not disabled';
  assert exists (select 1 from public.jobs where id = (select id from t_jdel)), 'trip history must stay';
end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
select public.delete_my_account();
reset role;
do $$ begin assert (select full_name from public.drivers where id = '00000000-0000-0000-0000-0000000000a5') = 'Deleted driver', 'driver not blanked'; end $$;
set role authenticated;

\echo 'REFERRAL CHECKS PASSED'
