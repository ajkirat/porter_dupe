-- Vehicle choices like Porter: each type has a capacity, a cargo size and its own fare.
-- Drivers pick their vehicle type; a job is shown only to drivers with the vehicle the customer chose.
-- Bike fares still come from Settings (base_fare, included_km, per_km, min_fare); the other types use their own row.
create table if not exists public.vehicle_types (
  code text primary key,
  name text not null,
  description text not null default '',
  max_kg integer not null check (max_kg > 0),
  length_cm integer not null check (length_cm > 0),
  width_cm integer not null check (width_cm > 0),
  height_cm integer not null check (height_cm > 0),
  base_fare integer not null check (base_fare >= 0),
  included_km numeric not null default 2 check (included_km >= 0),
  per_km integer not null check (per_km >= 0),
  min_fare integer not null default 0 check (min_fare >= 0),
  sort_order integer not null default 0,
  active boolean not null default true
);
alter table public.vehicle_types enable row level security;
create policy "anyone reads vehicle types" on public.vehicle_types for select using (true);
create policy "admin edits vehicle types" on public.vehicle_types for update using (public.is_admin()) with check (public.is_admin());
grant select on public.vehicle_types to anon, authenticated;
grant update on public.vehicle_types to authenticated;

-- Sizes and fares are starting points close to Porter's published figures: check and edit them in Admin → Vehicles.
insert into public.vehicle_types (code, name, description, max_kg, length_cm, width_cm, height_cm, base_fare, included_km, per_km, min_fare, sort_order) values
  ('bike',         'Bike',                 'Documents, small boxes, food, gifts', 20,   40,  30,  30,  40, 2, 10,  40, 1),
  ('three_wheeler','3 Wheeler',            'Furniture pieces, appliances, cartons', 500, 168, 122, 122, 150, 2, 18, 150, 2),
  ('tata_ace',     'Mini Truck (Tata Ace)', 'Shifting a room, bulk goods',          750, 213, 137, 146, 220, 2, 22, 220, 3),
  ('pickup_8ft',   'Pickup (8 ft)',        'Heavy loads, small house shifting',    1250, 244, 158, 152, 330, 2, 28, 330, 4)
on conflict (code) do nothing;

alter table public.drivers drop constraint if exists drivers_vehicle_type_fk;
alter table public.drivers add constraint drivers_vehicle_type_fk foreign key (vehicle_type) references public.vehicle_types (code);
alter table public.jobs drop constraint if exists jobs_vehicle_type_fk;
alter table public.jobs add constraint jobs_vehicle_type_fk foreign key (vehicle_type) references public.vehicle_types (code);

-- Fare for a distance and vehicle. Mirrors src/lib/fare.ts.
drop function if exists public.compute_fare(integer);
create or replace function public.compute_fare(p_distance_m integer, p_vehicle text default 'bike') returns integer
language plpgsql stable set search_path = public as $$
declare v public.vehicle_types; s public.settings;
begin
  select * into s from public.settings;
  if p_vehicle = 'bike' then
    return greatest(s.min_fare, s.base_fare + ceil(greatest(0, p_distance_m / 1000.0 - s.included_km) * s.per_km)::integer);
  end if;
  select * into v from public.vehicle_types where code = p_vehicle and active;
  if v.code is null then raise exception 'that vehicle type is not available'; end if;
  return greatest(v.min_fare, v.base_fare + ceil(greatest(0, p_distance_m / 1000.0 - v.included_km) * v.per_km)::integer);
end;
$$;

-- Booking now takes the vehicle type (default bike keeps old callers working).
drop function if exists public.create_job(
  text, double precision, double precision, text, double precision, double precision,
  text, text, integer, integer, text, text, text, text, text, boolean);

create or replace function public.create_job(
  p_pickup_address text, p_pickup_lat double precision, p_pickup_lng double precision,
  p_drop_address text, p_drop_lat double precision, p_drop_lng double precision,
  p_receiver_name text, p_receiver_phone text,
  p_distance_m integer, p_duration_s integer,
  p_item_note text default null,
  p_pickup_contact_name text default null, p_pickup_contact_phone text default null,
  p_payment_mode text default 'cash',
  p_pay_at text default 'drop',
  p_use_wallet boolean default false,
  p_vehicle_type text default 'bike'
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
  v_fare := public.compute_fare(v_distance, p_vehicle_type);

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
    distance_m, duration_s, fare_rupees, payment_mode, pay_at, wallet_discount, vehicle_type
  ) values (
    auth.uid(), p_pickup_address, p_pickup_lat, p_pickup_lng, p_pickup_contact_name, p_pickup_contact_phone,
    p_drop_address, p_drop_lat, p_drop_lng, p_receiver_name, p_receiver_phone, p_item_note,
    v_distance, p_duration_s, v_fare, p_payment_mode, p_pay_at, v_discount, p_vehicle_type
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

-- Drivers see, are alerted about, and can accept only jobs for their own vehicle type.
create or replace function public.driver_open_jobs(p_lat double precision, p_lng double precision)
returns setof public.jobs
language sql stable security definer set search_path = public as $$
  select j.* from public.jobs j, public.settings s
  where public.is_active_driver(auth.uid())
    and j.status = 'requested'
    and j.vehicle_type = (select d.vehicle_type from public.drivers d where d.id = auth.uid())
    and public.haversine_m(p_lat, p_lng, j.pickup_lat, j.pickup_lng) <= s.nearby_radius_km * 1000
    and not exists (select 1 from public.job_rejections r where r.job_id = j.id and r.driver_id = auth.uid())
  order by public.haversine_m(p_lat, p_lng, j.pickup_lat, j.pickup_lng)
  limit 20;
$$;

create or replace function public.accept_job(p_job uuid) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  if not public.is_active_driver(auth.uid()) then
    raise exception 'you need approved KYC and an active pass to take jobs';
  end if;
  if exists (select 1 from public.jobs where driver_id = auth.uid() and status in ('accepted', 'picked_up')) then
    raise exception 'finish your current job first';
  end if;
  update public.jobs set status = 'accepted', driver_id = auth.uid(), accepted_at = now()
  where id = p_job
    and vehicle_type = (select d.vehicle_type from public.drivers d where d.id = auth.uid())
    and (status = 'requested' or (status = 'assigned' and driver_id = auth.uid()))
  returning * into v_job;
  if v_job.id is null then raise exception 'job is no longer available'; end if;
  return v_job;
end;
$$;

create or replace function public.drivers_to_notify(p_job uuid)
returns table (driver_id uuid, token text)
language plpgsql security definer set search_path = public as $$
declare j public.jobs; s public.settings;
begin
  if not public.is_service_role() then raise exception 'server only'; end if;
  select * into j from public.jobs where id = p_job;
  select * into s from public.settings;
  if j.id is null then return; end if;
  if j.status = 'assigned' then
    return query select t.driver_id, t.token from public.driver_push_tokens t where t.driver_id = j.driver_id;
  elsif j.status = 'requested' then
    return query
      select t.driver_id, t.token
      from public.driver_push_tokens t
      join public.drivers d on d.id = t.driver_id
      where d.is_online
        and d.vehicle_type = j.vehicle_type
        and public.is_active_driver(d.id)
        and d.last_lat is not null
        and public.haversine_m(d.last_lat, d.last_lng, j.pickup_lat, j.pickup_lng) <= s.nearby_radius_km * 1000
        and not exists (select 1 from public.job_rejections r where r.job_id = j.id and r.driver_id = d.id)
        and not exists (select 1 from public.jobs a where a.driver_id = d.id and a.status in ('accepted', 'picked_up'));
  end if;
end;
$$;
revoke execute on function public.drivers_to_notify(uuid) from public, anon, authenticated;

-- The driver chooses their vehicle type while signing up or updating documents.
drop function if exists public.driver_update_profile(text, text, text, text, jsonb);
create or replace function public.driver_update_profile(
  p_full_name text, p_vehicle_number text, p_licence_number text, p_upi_id text, p_kyc_docs jsonb,
  p_vehicle_type text default null
) returns public.drivers
language plpgsql security definer set search_path = public as $$
declare v_driver public.drivers;
begin
  update public.drivers set
    full_name = p_full_name, vehicle_number = p_vehicle_number, licence_number = p_licence_number,
    upi_id = p_upi_id,
    vehicle_type = coalesce(p_vehicle_type, vehicle_type),
    kyc_docs = coalesce(p_kyc_docs, kyc_docs),
    kyc_status = case when kyc_status = 'rejected' then 'pending'::public.kyc_status else kyc_status end
  where id = auth.uid()
  returning * into v_driver;
  return v_driver;
end;
$$;
