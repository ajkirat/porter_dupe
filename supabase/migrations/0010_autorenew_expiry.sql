-- 1) Pass auto-renew from the wallet.   2) Optional wallet credit expiry (first in, first out).

alter table public.settings
  add column wallet_expiry_days integer not null default 0 check (wallet_expiry_days >= 0);   -- 0 = credit never expires

alter table public.drivers
  add column auto_renew_pass boolean not null default true;

-- ---------------------------------------------------------------------------
-- Credit expiry. Each credit remembers how much of it is left and when it lapses.
-- Spending always uses the oldest credit first. The balance is what is left of credit that has not lapsed.
-- ---------------------------------------------------------------------------
alter table public.wallet_entries
  add column remaining_rupees integer not null default 0 check (remaining_rupees >= 0),
  add column expires_at timestamptz;

-- Existing history: give every credit its full amount, then replay old spends against the oldest credit first.
update public.wallet_entries set remaining_rupees = amount_rupees where amount_rupees > 0;
do $$
declare
  spend record;
  credit record;
  need integer;
  take integer;
begin
  for spend in select * from public.wallet_entries where amount_rupees < 0 order by created_at loop
    need := -spend.amount_rupees;
    for credit in
      select id, remaining_rupees from public.wallet_entries
      where user_id = spend.user_id and wallet = spend.wallet and amount_rupees > 0 and remaining_rupees > 0 and created_at <= spend.created_at
      order by created_at, id
    loop
      exit when need <= 0;
      take := least(need, credit.remaining_rupees);
      update public.wallet_entries set remaining_rupees = remaining_rupees - take where id = credit.id;
      need := need - take;
    end loop;
  end loop;
end $$;

create or replace function public.wallet_entry_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_days integer;
  c record;
  need integer;
  take integer;
begin
  if new.amount_rupees > 0 then
    select wallet_expiry_days into v_days from public.settings;
    new.remaining_rupees := new.amount_rupees;
    new.expires_at := case when v_days > 0 then now() + make_interval(days => v_days) end;
  else
    -- A spend uses the oldest credit that has not lapsed. Lock the rows so two spends cannot take the same rupee.
    need := -new.amount_rupees;
    for c in
      select id, remaining_rupees from public.wallet_entries
      where user_id = new.user_id and wallet = new.wallet and amount_rupees > 0 and remaining_rupees > 0
        and (expires_at is null or expires_at > now())
      order by created_at, id
      for update
    loop
      exit when need <= 0;
      take := least(need, c.remaining_rupees);
      update public.wallet_entries set remaining_rupees = remaining_rupees - take where id = c.id;
      need := need - take;
    end loop;
    if need > 0 then raise exception 'Not enough wallet credit'; end if;
    new.remaining_rupees := 0;
    new.expires_at := null;
  end if;
  return new;
end;
$$;
create trigger wallet_entries_before_insert before insert on public.wallet_entries
  for each row execute function public.wallet_entry_before_insert();
revoke execute on function public.wallet_entry_before_insert() from public, anon, authenticated;

-- The balance people can actually spend.
create or replace function public.wallet_balance(p_user uuid, p_wallet text) returns integer
language sql stable security definer set search_path = public as $$
  select case when p_user = auth.uid() or public.is_admin() or public.is_service_role()
              then coalesce((select sum(remaining_rupees) from public.wallet_entries
                              where user_id = p_user and wallet = p_wallet and amount_rupees > 0
                                and (expires_at is null or expires_at > now())), 0)::integer
         end;
$$;

create or replace function public.my_wallet(p_wallet text) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(remaining_rupees) from public.wallet_entries
                    where user_id = auth.uid() and wallet = p_wallet and amount_rupees > 0
                      and (expires_at is null or expires_at > now())), 0)::integer;
$$;

-- When the next bit of my credit lapses, so the app can say "₹50 expires on 12 Dec".
create or replace function public.my_wallet_expiring(p_wallet text)
returns table (amount integer, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select sum(remaining_rupees)::integer, e.expires_at
  from public.wallet_entries e
  where e.user_id = auth.uid() and e.wallet = p_wallet and e.amount_rupees > 0 and e.remaining_rupees > 0
    and e.expires_at is not null and e.expires_at > now()
  group by e.expires_at order by e.expires_at limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Auto-renew
-- ---------------------------------------------------------------------------

-- Renews an expired pass of the same kind as the last one, if the driver has opted in and has enough credit.
-- Returns the new pass, or nothing when nothing was renewed.
create or replace function public.driver_auto_renew() returns public.driver_passes
language plpgsql security definer set search_path = public as $$
declare
  d public.drivers;
  s public.settings;
  v_kind text;
  v_price integer;
  v_pass public.driver_passes;
begin
  if auth.uid() is null then return null; end if;
  select * into d from public.drivers where id = auth.uid() and kyc_status = 'approved' and auto_renew_pass;
  if d.id is null then return null; end if;
  perform 1 from public.profiles where id = auth.uid() for update;   -- one renewal at a time
  if public.has_active_pass(auth.uid()) then return null; end if;
  -- A pass that is booked for later (starts in the future) counts as covered.
  if exists (select 1 from public.driver_passes where driver_id = auth.uid() and ends_at > now()) then return null; end if;
  select kind into v_kind from public.driver_passes where driver_id = auth.uid() order by ends_at desc limit 1;
  if v_kind is null then return null; end if;   -- the first pass is always bought by hand
  select * into s from public.settings;
  v_price := case v_kind when 'daily' then s.daily_pass_price else s.weekly_pass_price end;
  if public.my_wallet('driver') < v_price then return null; end if;
  insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, note)
  values (auth.uid(), 'driver', -v_price, 'pass_payment', v_kind || ' pass (auto-renewed)');
  insert into public.driver_passes (driver_id, kind, starts_at, ends_at, amount_rupees, wallet_rupees, recorded_by, note)
  values (auth.uid(), v_kind, now(), now() + case v_kind when 'daily' then interval '1 day' else interval '7 days' end,
          v_price, v_price, auth.uid(), 'Auto-renewed from wallet')
  returning * into v_pass;
  return v_pass;
end;
$$;

create or replace function public.driver_set_auto_renew(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.drivers set auto_renew_pass = coalesce(p_on, true) where id = auth.uid();
  if not found then raise exception 'drivers only'; end if;
end;
$$;

grant execute on function public.my_wallet_expiring(text), public.driver_auto_renew(), public.driver_set_auto_renew(boolean) to authenticated;
