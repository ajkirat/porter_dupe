-- Pikop Driver app: arrival notice, driver-side cancel, and the sender's phone for the driver to call.

alter table public.jobs add column driver_arrived_at timestamptz;

-- If the customer gave no separate pickup contact, the driver calls the customer themselves.
create or replace function public.jobs_fill_pickup_phone() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  if new.pickup_contact_phone is null or new.pickup_contact_phone = '' then
    select phone into v_phone from public.profiles where id = new.customer_id;
    if v_phone is not null and v_phone <> '' then
      new.pickup_contact_phone := case when v_phone like '+%' then v_phone else '+' || v_phone end;
    end if;
  end if;
  return new;
end;
$$;

create trigger jobs_fill_pickup_phone before insert on public.jobs
  for each row execute function public.jobs_fill_pickup_phone();

-- "I've arrived at pickup": the customer sees it on their order screen.
create or replace function public.mark_arrived(p_job uuid) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  update public.jobs set driver_arrived_at = coalesce(driver_arrived_at, now())
  where id = p_job and driver_id = auth.uid() and status = 'accepted'
  returning * into v_job;
  if v_job.id is null then raise exception 'this job is not waiting for pickup'; end if;
  return v_job;
end;
$$;

-- Admins can see why drivers dropped jobs.
create table public.job_driver_cancellations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.job_driver_cancellations enable row level security;
create policy "admin reads driver cancellations" on public.job_driver_cancellations for select using (public.is_admin());

-- A driver drops a job before pickup. It goes back to the open list and is not re-offered to them.
create or replace function public.driver_cancel_job(p_job uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  update public.jobs
  set status = 'requested', driver_id = null, accepted_at = null, assigned_at = null, driver_arrived_at = null
  where id = p_job and driver_id = auth.uid() and status in ('accepted', 'assigned')
  returning true into v_ok;
  if v_ok is null then raise exception 'this job can no longer be dropped'; end if;
  insert into public.job_rejections (job_id, driver_id) values (p_job, auth.uid()) on conflict do nothing;
  insert into public.job_driver_cancellations (job_id, driver_id, reason) values (p_job, auth.uid(), p_reason);
end;
$$;
