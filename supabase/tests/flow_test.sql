-- End-to-end check of the booking flow against the RLS rules.
-- Run with: ./supabase/tests/run.sh
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', '+919000000001'),  -- admin
  ('00000000-0000-0000-0000-00000000000c', '+919000000002'),  -- customer
  ('00000000-0000-0000-0000-00000000000d', '+919000000003'),  -- driver
  ('00000000-0000-0000-0000-00000000000e', '+919000000004');  -- second driver
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000a';

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

set role authenticated;

-- Drivers sign up
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.drivers (id, full_name, phone, vehicle_number, licence_number, upi_id)
values ('00000000-0000-0000-0000-00000000000d', 'Ravi', '+919000000003', 'KA01AB1234', 'DL123', 'ravi@upi');
update public.drivers set kyc_status = 'approved';  -- silently affects 0 rows under RLS
do $$ begin assert (select kyc_status from public.drivers) = 'pending', 'driver self-approved'; end $$;
select pg_temp.expect_error($$select public.driver_set_online(true)$$, 'approved KYC');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into public.drivers (id, full_name, phone, vehicle_number, licence_number)
values ('00000000-0000-0000-0000-00000000000e', 'Suresh', '+919000000004', 'KA02CD5678', 'DL456');

-- Customer books (Koramangala -> Indiranagar, ~5 km)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$select public.create_job('a', 12.9352, 77.6245, 'b', 12.9353, 77.6245, 'R', '9', 50, 10)$$, 'too close');
create temp table t_job as
  select * from public.create_job('Koramangala', 12.9352, 77.6245, 'Indiranagar', 12.9784, 77.6408,
                                  'Meera', '+919000000009', 1000, 900, 'Documents');
do $$ declare j record; begin
  select * into j from t_job;
  -- client claimed 1 km; server must floor it at the straight-line distance (~5 km)
  assert j.distance_m > 4500, format('distance not floored: %s', j.distance_m);
  assert j.fare_rupees = 40 + ceil((j.distance_m / 1000.0 - 2) * 10), format('fare %s', j.fare_rupees);
  assert (select count(*) from public.job_secrets) = 1, 'customer cannot read own OTPs';
end $$;

-- Payment collection point defaults to the drop and only accepts pickup or drop
do $$ begin assert (select pay_at from t_job) = 'drop', 'pay_at default'; end $$;
select pg_temp.expect_error($$select public.create_job('a', 12.9352, 77.6245, 'b', 12.9784, 77.6408, 'R', '9', 5000, 600, p_pay_at => 'nope')$$, 'check constraint');

-- Driver with no approval/pass sees nothing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from public.jobs) = 0, 'unapproved driver can see jobs';
  assert (select count(*) from public.driver_open_jobs(12.94, 77.62)) = 0, 'unapproved driver gets open jobs';
end $$;
select pg_temp.expect_error($$select public.admin_add_pass('00000000-0000-0000-0000-00000000000d', 'daily')$$, 'admins only');

-- Admin approves KYC and records passes
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.drivers set kyc_status = 'approved';
select public.admin_add_pass('00000000-0000-0000-0000-00000000000d', 'daily');
select public.admin_add_pass('00000000-0000-0000-0000-00000000000d', 'weekly');
select public.admin_add_pass('00000000-0000-0000-0000-00000000000e', 'daily');
do $$ begin
  -- weekly stacks after the daily
  assert (select max(ends_at) - min(starts_at) from public.driver_passes
          where driver_id = '00000000-0000-0000-0000-00000000000d') = interval '8 days', 'passes did not stack';
end $$;

-- Admin offers the job to driver E, who rejects; it goes back to requested
select public.admin_assign_job((select id from t_job), '00000000-0000-0000-0000-00000000000e');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select public.reject_job((select id from t_job));
do $$ begin
  assert (select status from public.jobs where id = (select id from t_job)) = 'requested', 'reject did not release job';
  assert (select count(*) from public.driver_open_jobs(12.94, 77.62)) = 0, 'rejected job re-shown to same driver';
end $$;

-- Driver D goes online, finds and accepts it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.driver_set_online(true)$$, 'selfie is required');
select pg_temp.expect_error($$select public.driver_set_online(true, '00000000-0000-0000-0000-00000000000e/x.jpg')$$, 'selfie is required');
select public.driver_set_online(true, '00000000-0000-0000-0000-00000000000d/selfie-1.jpg');
do $$ begin assert (select last_selfie_path from public.drivers) like '%selfie-1.jpg', 'selfie not recorded'; end $$;
select public.driver_set_location(12.936, 77.625);
do $$ begin
  assert (select count(*) from public.driver_open_jobs(12.936, 77.625)) = 1, 'open job not visible nearby';
  assert (select count(*) from public.driver_open_jobs(13.10, 77.59)) = 0, 'far job visible';
  assert (select count(*) from public.job_secrets) = 0, 'driver can read OTPs';
end $$;
select public.accept_job((select id from t_job));

-- Sender's phone is filled in for the driver; arrival is recorded; a driver can drop the job and take it again
do $$ declare j record; begin
  select * into j from public.jobs;
  assert j.pickup_contact_phone = '+919000000002', format('pickup phone %s', j.pickup_contact_phone);
end $$;
select public.mark_arrived((select id from t_job));
do $$ begin assert (select driver_arrived_at from public.jobs) is not null, 'arrival not recorded'; end $$;
select public.driver_cancel_job((select id from t_job), 'bike broke down');
do $$ begin
  assert (select status from public.jobs where id = (select id from t_job)) = 'requested', 'cancel did not release job';
  assert (select driver_arrived_at from public.jobs where id = (select id from t_job)) is null, 'arrival not cleared';
  assert (select count(*) from public.driver_open_jobs(12.936, 77.625)) = 0, 'dropped job re-offered to same driver';
end $$;
select pg_temp.expect_error(format('select public.mark_arrived(%L)', (select id from t_job)), 'not waiting for pickup');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_assign_job((select id from t_job), '00000000-0000-0000-0000-00000000000d');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.accept_job((select id from t_job));

-- Second driver can't steal it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error(format('select public.accept_job(%L)', (select id from t_job)), 'no longer available');

-- OTP flow
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error(format('select public.mark_delivered(%L, %L)', (select id from t_job), '0000'), 'wrong drop OTP');
select pg_temp.expect_error(format('select public.mark_picked_up(%L, %L)', (select id from t_job), 'nope'), 'wrong pickup OTP');
reset role;
create temp table t_otp as select * from public.job_secrets;
grant select on t_otp to authenticated;
set role authenticated;
select public.mark_picked_up((select id from t_job), (select pickup_otp from t_otp));
select public.mark_delivered((select id from t_job), ' ' || (select drop_otp from t_otp) || ' ');

-- Customer sees driver details for their job; cannot cancel a delivered job
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select status from public.jobs) = 'delivered', 'not delivered';
  assert (select count(*) from public.drivers) = 1, 'customer should see exactly their driver';
end $$;
select pg_temp.expect_error(format('select public.cancel_job(%L)', (select id from t_job)), 'cannot be cancelled');

-- Anonymous tracking
reset role;
grant select on t_job to anon;
set role anon;
select pg_temp.as_user('');
do $$ begin
  assert (select status from public.get_tracking((select tracking_token from t_job))) = 'delivered', 'tracking broken';
  assert (select driver_lat from public.get_tracking((select tracking_token from t_job))) is null, 'location leaked after delivery';
  assert (select count(*) from public.get_tracking('bogus')) = 0, 'bogus token matched';
end $$;

reset role;
\echo 'ALL CHECKS PASSED'
