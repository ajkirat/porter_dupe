-- Push alerts: each driver phone registers a Firebase token; a server function looks up who to alert for a new job.
create table public.driver_push_tokens (
  token text primary key,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index driver_push_tokens_driver_idx on public.driver_push_tokens (driver_id);
alter table public.driver_push_tokens enable row level security;
-- Only the owner sees their tokens; writes go through the function below.
create policy "driver reads own tokens" on public.driver_push_tokens for select using (driver_id = auth.uid());

create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_setting('request.jwt.claim.role', true)) = 'service_role';
$$;

-- Driver: remember this phone's token (a token belongs to one driver at a time).
create or replace function public.driver_save_push_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.drivers where id = auth.uid()) then raise exception 'drivers only'; end if;
  insert into public.driver_push_tokens (token, driver_id) values (p_token, auth.uid())
  on conflict (token) do update set driver_id = excluded.driver_id, updated_at = now();
end;
$$;

-- Server: who should be alerted about this job? An offered job goes to the offered driver only; an open job goes to
-- online, passed, nearby drivers who haven't passed on it. Tokens come back with the driver id.
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
        and public.is_active_driver(d.id)
        and d.last_lat is not null
        and public.haversine_m(d.last_lat, d.last_lng, j.pickup_lat, j.pickup_lng) <= s.nearby_radius_km * 1000
        and not exists (select 1 from public.job_rejections r where r.job_id = j.id and r.driver_id = d.id)
        and not exists (select 1 from public.jobs a where a.driver_id = d.id and a.status in ('accepted', 'picked_up'));
  end if;
end;
$$;

-- Server: a token that Firebase says is dead.
create or replace function public.remove_push_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_service_role() then raise exception 'server only'; end if;
  delete from public.driver_push_tokens where token = p_token;
end;
$$;

revoke execute on function public.drivers_to_notify(uuid) from public, anon, authenticated;
revoke execute on function public.remove_push_token(text) from public, anon, authenticated;
