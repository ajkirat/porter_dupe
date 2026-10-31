-- A selfie is needed every time a driver goes online. The photo is uploaded to the private
-- "kyc" bucket (under the driver's own folder) and its path is recorded here for admins.
alter table public.drivers add column last_selfie_path text, add column last_selfie_at timestamptz;

create table public.driver_selfies (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);
alter table public.driver_selfies enable row level security;
create policy "driver or admin reads selfies" on public.driver_selfies for select using (driver_id = auth.uid() or public.is_admin());

drop function public.driver_set_online(boolean);
create or replace function public.driver_set_online(p_online boolean, p_selfie text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_online then
    if not public.is_active_driver(auth.uid()) then
      raise exception 'you need approved KYC and an active pass to go online';
    end if;
    if p_selfie is null or p_selfie not like auth.uid()::text || '/%' then
      raise exception 'a selfie is required to go online';
    end if;
    insert into public.driver_selfies (driver_id, path) values (auth.uid(), p_selfie);
    update public.drivers set last_selfie_path = p_selfie, last_selfie_at = now() where id = auth.uid();
  end if;
  update public.drivers set is_online = p_online, last_seen_at = now() where id = auth.uid();
end;
$$;
