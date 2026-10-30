-- Porter-style bike parcel MVP: core schema.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to read top to bottom:
-- tables, then helper functions, then row level security, then the RPCs the app calls.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create type public.kyc_status as enum ('pending', 'approved', 'rejected');

create table public.drivers (
  id uuid primary key references public.profiles (id) on delete cascade,
  full_name text not null,
  phone text not null,
  vehicle_type text not null default 'bike',
  vehicle_number text not null,
  licence_number text not null,
  upi_id text,
  -- Storage paths inside the private `kyc` bucket, keyed by document type.
  kyc_docs jsonb not null default '{}'::jsonb,
  kyc_status public.kyc_status not null default 'pending',
  kyc_note text,
  is_online boolean not null default false,
  last_lat double precision,
  last_lng double precision,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Subscription passes. The driver pays the platform outside the app
-- (cash or UPI to the operator); an admin records the pass here.
create table public.driver_passes (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  amount_rupees integer not null,
  recorded_by uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create index driver_passes_driver_idx on public.driver_passes (driver_id, ends_at desc);

-- Single-row settings table for fares and pass prices.
create table public.settings (
  id boolean primary key default true check (id),
  base_fare integer not null default 40,          -- rupees, covers included_km
  included_km numeric not null default 2,
  per_km integer not null default 10,             -- rupees per km after included_km
  min_fare integer not null default 40,
  daily_pass_price integer not null default 75,
  weekly_pass_price integer not null default 500,
  nearby_radius_km numeric not null default 6,    -- how far drivers see open jobs
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

create type public.job_status as enum (
  'requested',   -- waiting for a driver
  'assigned',    -- an admin offered it to one driver, who must accept or reject
  'accepted',    -- driver is heading to pickup
  'picked_up',   -- parcel collected (pickup OTP verified)
  'delivered',   -- parcel handed over (drop OTP verified)
  'cancelled'
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  driver_id uuid references public.drivers (id),
  status public.job_status not null default 'requested',
  vehicle_type text not null default 'bike',
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_contact_name text,
  pickup_contact_phone text,
  drop_address text not null,
  drop_lat double precision not null,
  drop_lng double precision not null,
  receiver_name text not null,
  receiver_phone text not null,
  item_note text,
  distance_m integer not null,
  duration_s integer,
  fare_rupees integer not null,
  payment_mode text not null default 'cash' check (payment_mode in ('cash', 'upi_to_driver')),
  tracking_token text not null unique default encode(gen_random_bytes(9), 'hex'),
  cancel_reason text,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);
create index jobs_status_idx on public.jobs (status, created_at desc);
create index jobs_customer_idx on public.jobs (customer_id, created_at desc);
create index jobs_driver_idx on public.jobs (driver_id, created_at desc);

-- OTPs live apart from jobs so the driver can read the job but never the codes.
create table public.job_secrets (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  pickup_otp text not null,
  drop_otp text not null
);

-- Drivers who rejected an admin offer, so the same job isn't re-offered blindly.
create table public.job_rejections (
  job_id uuid not null references public.jobs (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, driver_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.has_active_pass(p_driver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.driver_passes
    where driver_id = p_driver and starts_at <= now() and ends_at > now()
  );
$$;

-- An approved driver with a running pass. Only these can see or take jobs.
create or replace function public.is_active_driver(p_driver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.drivers where id = p_driver and kyc_status = 'approved'
  ) and public.has_active_pass(p_driver);
$$;

create or replace function public.haversine_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Mirrors src/lib/fare.ts. Keep the two in sync.
create or replace function public.compute_fare(p_distance_m integer) returns integer
language sql stable set search_path = public as $$
  select greatest(
    s.min_fare,
    s.base_fare + ceil(greatest(0, p_distance_m / 1000.0 - s.included_km) * s.per_km)::integer
  )
  from public.settings s;
$$;

create or replace function public.random_otp() returns text
language sql volatile as $$
  select lpad((floor(random() * 10000))::int::text, 4, '0');
$$;

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_passes enable row level security;
alter table public.settings enable row level security;
alter table public.jobs enable row level security;
alter table public.job_secrets enable row level security;
alter table public.job_rejections enable row level security;

-- profiles
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid()));

-- drivers: a driver manages their own row; admins see all; a customer sees the
-- driver on their own job (name, phone, vehicle, UPI, live location).
create policy "driver reads self" on public.drivers for select using (
  id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.jobs j where j.driver_id = drivers.id and j.customer_id = auth.uid())
);
create policy "driver signs up" on public.drivers for insert with check (id = auth.uid() and kyc_status = 'pending');
create policy "admin updates drivers" on public.drivers for update using (public.is_admin());
-- Drivers change their own row only through driver_update_profile / set_location RPCs,
-- so they cannot approve their own KYC.

-- passes
create policy "driver reads own passes" on public.driver_passes for select
  using (driver_id = auth.uid() or public.is_admin());
create policy "admin writes passes" on public.driver_passes for insert with check (public.is_admin());
create policy "admin deletes passes" on public.driver_passes for delete using (public.is_admin());

-- settings
create policy "anyone reads settings" on public.settings for select using (true);
create policy "admin updates settings" on public.settings for update using (public.is_admin());

-- jobs: customers see their own; drivers see jobs assigned to them, plus open
-- jobs while they are an active driver; admins see everything.
create policy "read jobs" on public.jobs for select using (
  customer_id = auth.uid()
  or driver_id = auth.uid()
  or public.is_admin()
  or (status = 'requested' and public.is_active_driver(auth.uid()))
);
-- All writes go through the RPCs below.

create policy "customer reads own otps" on public.job_secrets for select using (
  public.is_admin() or exists (select 1 from public.jobs j where j.id = job_id and j.customer_id = auth.uid())
);

create policy "admin reads rejections" on public.job_rejections for select using (public.is_admin() or driver_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs (all state changes go through these)
-- ---------------------------------------------------------------------------

-- Customer books a job. Fare is computed here, never trusted from the client.
create or replace function public.create_job(
  p_pickup_address text, p_pickup_lat double precision, p_pickup_lng double precision,
  p_drop_address text, p_drop_lat double precision, p_drop_lng double precision,
  p_receiver_name text, p_receiver_phone text,
  p_distance_m integer, p_duration_s integer,
  p_item_note text default null,
  p_pickup_contact_name text default null, p_pickup_contact_phone text default null,
  p_payment_mode text default 'cash'
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
    distance_m, duration_s, fare_rupees, payment_mode
  ) values (
    auth.uid(), p_pickup_address, p_pickup_lat, p_pickup_lng, p_pickup_contact_name, p_pickup_contact_phone,
    p_drop_address, p_drop_lat, p_drop_lng, p_receiver_name, p_receiver_phone, p_item_note,
    v_distance, p_duration_s, public.compute_fare(v_distance), p_payment_mode
  ) returning * into v_job;

  insert into public.job_secrets (job_id, pickup_otp, drop_otp)
  values (v_job.id, public.random_otp(), public.random_otp());

  return v_job;
end;
$$;

create or replace function public.cancel_job(p_job uuid, p_reason text default null) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  update public.jobs set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
  where id = p_job
    and (customer_id = auth.uid() or public.is_admin())
    and status in ('requested', 'assigned', 'accepted')
  returning * into v_job;
  if v_job.id is null then raise exception 'job cannot be cancelled'; end if;
  return v_job;
end;
$$;

-- Driver: profile edits that don't touch KYC status. Re-submitting docs puts KYC back to pending.
create or replace function public.driver_update_profile(
  p_full_name text, p_vehicle_number text, p_licence_number text, p_upi_id text, p_kyc_docs jsonb
) returns public.drivers
language plpgsql security definer set search_path = public as $$
declare v_driver public.drivers;
begin
  update public.drivers set
    full_name = p_full_name, vehicle_number = p_vehicle_number, licence_number = p_licence_number,
    upi_id = p_upi_id,
    kyc_docs = coalesce(p_kyc_docs, kyc_docs),
    kyc_status = case when kyc_status = 'rejected' then 'pending'::public.kyc_status else kyc_status end
  where id = auth.uid()
  returning * into v_driver;
  return v_driver;
end;
$$;

create or replace function public.driver_set_online(p_online boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_online and not public.is_active_driver(auth.uid()) then
    raise exception 'you need approved KYC and an active pass to go online';
  end if;
  update public.drivers set is_online = p_online, last_seen_at = now() where id = auth.uid();
end;
$$;

create or replace function public.driver_set_location(p_lat double precision, p_lng double precision) returns void
language sql security definer set search_path = public as $$
  update public.drivers set last_lat = p_lat, last_lng = p_lng, last_seen_at = now() where id = auth.uid();
$$;

-- Open jobs near the driver, nearest first.
create or replace function public.driver_open_jobs(p_lat double precision, p_lng double precision)
returns setof public.jobs
language sql stable security definer set search_path = public as $$
  select j.* from public.jobs j, public.settings s
  where public.is_active_driver(auth.uid())
    and j.status = 'requested'
    and public.haversine_m(p_lat, p_lng, j.pickup_lat, j.pickup_lng) <= s.nearby_radius_km * 1000
    and not exists (select 1 from public.job_rejections r where r.job_id = j.id and r.driver_id = auth.uid())
  order by public.haversine_m(p_lat, p_lng, j.pickup_lat, j.pickup_lng)
  limit 20;
$$;

-- Driver accepts an open job (first come, first served) or one offered to them.
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
    and (status = 'requested' or (status = 'assigned' and driver_id = auth.uid()))
  returning * into v_job;
  if v_job.id is null then raise exception 'job is no longer available'; end if;
  return v_job;
end;
$$;

-- Driver turns down a job offered to them (or hides an open one).
create or replace function public.reject_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.job_rejections (job_id, driver_id) values (p_job, auth.uid())
  on conflict do nothing;
  update public.jobs set status = 'requested', driver_id = null, assigned_at = null
  where id = p_job and status = 'assigned' and driver_id = auth.uid();
end;
$$;

create or replace function public.mark_picked_up(p_job uuid, p_otp text) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  update public.jobs j set status = 'picked_up', picked_up_at = now()
  from public.job_secrets s
  where j.id = p_job and s.job_id = j.id
    and j.driver_id = auth.uid() and j.status = 'accepted'
    and s.pickup_otp = trim(p_otp)
  returning j.* into v_job;
  if v_job.id is null then raise exception 'wrong pickup OTP'; end if;
  return v_job;
end;
$$;

create or replace function public.mark_delivered(p_job uuid, p_otp text) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  update public.jobs j set status = 'delivered', delivered_at = now()
  from public.job_secrets s
  where j.id = p_job and s.job_id = j.id
    and j.driver_id = auth.uid() and j.status = 'picked_up'
    and s.drop_otp = trim(p_otp)
  returning j.* into v_job;
  if v_job.id is null then raise exception 'wrong drop OTP'; end if;
  return v_job;
end;
$$;

-- Admin: offer a job to a specific driver (manual dispatch fallback).
create or replace function public.admin_assign_job(p_job uuid, p_driver uuid) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if not public.is_active_driver(p_driver) then raise exception 'driver is not approved or has no active pass'; end if;
  delete from public.job_rejections where job_id = p_job and driver_id = p_driver;
  update public.jobs set status = 'assigned', driver_id = p_driver, assigned_at = now()
  where id = p_job and status in ('requested', 'assigned')
  returning * into v_job;
  if v_job.id is null then raise exception 'job cannot be assigned in its current state'; end if;
  return v_job;
end;
$$;

-- Admin: record a pass the driver paid for offline.
create or replace function public.admin_add_pass(p_driver uuid, p_kind text, p_note text default null)
returns public.driver_passes
language plpgsql security definer set search_path = public as $$
declare
  v_pass public.driver_passes;
  v_start timestamptz;
  s public.settings;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into s from public.settings;
  -- Stack on top of any pass still running.
  select greatest(now(), coalesce(max(ends_at), now())) into v_start
  from public.driver_passes where driver_id = p_driver;
  insert into public.driver_passes (driver_id, kind, starts_at, ends_at, amount_rupees, recorded_by, note)
  values (
    p_driver, p_kind, v_start,
    v_start + case p_kind when 'daily' then interval '1 day' else interval '7 days' end,
    case p_kind when 'daily' then s.daily_pass_price else s.weekly_pass_price end,
    auth.uid(), p_note
  ) returning * into v_pass;
  return v_pass;
end;
$$;

-- Public tracking page: anyone with the token sees status and the driver's position.
create or replace function public.get_tracking(p_token text)
returns table (
  status public.job_status, pickup_address text, pickup_lat double precision, pickup_lng double precision,
  drop_address text, drop_lat double precision, drop_lng double precision,
  driver_name text, vehicle_number text, driver_lat double precision, driver_lng double precision,
  driver_seen_at timestamptz, created_at timestamptz, delivered_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select j.status, j.pickup_address, j.pickup_lat, j.pickup_lng,
         j.drop_address, j.drop_lat, j.drop_lng,
         d.full_name, d.vehicle_number,
         case when j.status in ('accepted', 'picked_up') then d.last_lat end,
         case when j.status in ('accepted', 'picked_up') then d.last_lng end,
         case when j.status in ('accepted', 'picked_up') then d.last_seen_at end,
         j.created_at, j.delivered_at
  from public.jobs j left join public.drivers d on d.id = j.driver_id
  where j.tracking_token = p_token;
$$;

grant execute on function public.get_tracking(text) to anon, authenticated;

-- Realtime: push job and driver changes to subscribed clients (RLS still applies).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.drivers;
  end if;
end $$;
