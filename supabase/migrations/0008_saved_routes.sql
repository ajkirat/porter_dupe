-- Saved routes: a customer's favourite pickup and drop pairs, so a repeat booking takes two taps.
create table public.saved_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 60),
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  drop_address text not null,
  drop_lat double precision not null,
  drop_lng double precision not null,
  receiver_name text,
  receiver_phone text,
  pickup_contact_name text,
  pickup_contact_phone text,
  item_note text,
  created_at timestamptz not null default now()
);
create index saved_routes_user_idx on public.saved_routes (user_id, created_at desc);

alter table public.saved_routes enable row level security;
create policy "own saved routes" on public.saved_routes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keep it tidy: at most 20 saved routes per person.
create or replace function public.limit_saved_routes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.saved_routes where user_id = new.user_id) >= 20 then
    raise exception 'You can save up to 20 routes. Delete one first.';
  end if;
  return new;
end;
$$;
create trigger saved_routes_limit before insert on public.saved_routes
  for each row execute function public.limit_saved_routes();
