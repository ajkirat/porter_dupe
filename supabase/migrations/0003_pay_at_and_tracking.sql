-- Customers choose where the driver collects payment: at pickup (sender pays) or at drop (receiver pays).
-- Also exposes fare and payment details on the public tracking page.

alter table public.jobs
  add column pay_at text not null default 'drop' check (pay_at in ('pickup', 'drop'));

-- Replace create_job with a version that takes p_pay_at. The old signature is dropped first so
-- calls by name don't become ambiguous.
drop function if exists public.create_job(
  text, double precision, double precision, text, double precision, double precision,
  text, text, integer, integer, text, text, text, text
);

create or replace function public.create_job(
  p_pickup_address text, p_pickup_lat double precision, p_pickup_lng double precision,
  p_drop_address text, p_drop_lat double precision, p_drop_lng double precision,
  p_receiver_name text, p_receiver_phone text,
  p_distance_m integer, p_duration_s integer,
  p_item_note text default null,
  p_pickup_contact_name text default null, p_pickup_contact_phone text default null,
  p_payment_mode text default 'cash',
  p_pay_at text default 'drop'
) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_min_m integer;
  v_distance integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Road distance can't be shorter than the straight line.
  v_min_m := ceil(public.haversine_m(p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng));
  v_distance := greatest(coalesce(p_distance_m, 0), v_min_m);
  if v_distance < 100 then raise exception 'pickup and drop are too close'; end if;
  if v_distance > 60000 then raise exception 'trip is longer than 60 km'; end if;

  insert into public.jobs (
    customer_id, pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    drop_address, drop_lat, drop_lng, receiver_name, receiver_phone, item_note,
    distance_m, duration_s, fare_rupees, payment_mode, pay_at
  ) values (
    auth.uid(), p_pickup_address, p_pickup_lat, p_pickup_lng, p_pickup_contact_name, p_pickup_contact_phone,
    p_drop_address, p_drop_lat, p_drop_lng, p_receiver_name, p_receiver_phone, p_item_note,
    v_distance, p_duration_s, public.compute_fare(v_distance), p_payment_mode, p_pay_at
  ) returning * into v_job;

  insert into public.job_secrets (job_id, pickup_otp, drop_otp)
  values (v_job.id, public.random_otp(), public.random_otp());

  return v_job;
end;
$$;

-- Tracking page: adds fare, who pays and where, so the receiver knows if cash is due at the door.
drop function if exists public.get_tracking(text);

create or replace function public.get_tracking(p_token text)
returns table (
  status public.job_status, pickup_address text, pickup_lat double precision, pickup_lng double precision,
  drop_address text, drop_lat double precision, drop_lng double precision,
  driver_name text, vehicle_number text, driver_lat double precision, driver_lng double precision,
  driver_seen_at timestamptz, created_at timestamptz, delivered_at timestamptz,
  fare_rupees integer, pay_at text, payment_mode text
)
language sql stable security definer set search_path = public as $$
  select j.status, j.pickup_address, j.pickup_lat, j.pickup_lng,
         j.drop_address, j.drop_lat, j.drop_lng,
         d.full_name, d.vehicle_number,
         case when j.status in ('accepted', 'picked_up') then d.last_lat end,
         case when j.status in ('accepted', 'picked_up') then d.last_lng end,
         case when j.status in ('accepted', 'picked_up') then d.last_seen_at end,
         j.created_at, j.delivered_at,
         j.fare_rupees, j.pay_at, j.payment_mode
  from public.jobs j left join public.drivers d on d.id = j.driver_id
  where j.tracking_token = p_token;
$$;

grant execute on function public.get_tracking(text) to anon, authenticated;
