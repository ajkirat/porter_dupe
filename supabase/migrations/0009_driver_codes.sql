-- A short, unique, human-friendly ID for every driver (PK1001, PK1002, ...), so names never have to be matched by eye.
create sequence public.driver_code_seq start 1001;
grant usage on sequence public.driver_code_seq to authenticated;

alter table public.drivers
  add column driver_code text not null unique default ('PK' || nextval('public.driver_code_seq'));

-- Admin: credit the same amount to many drivers in one go. All or nothing.
create or replace function public.admin_bulk_wallet_credit(p_drivers uuid[], p_amount integer, p_note text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'a reason is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then raise exception 'amount must be between 1 and 10000'; end if;
  select coalesce(array_agg(distinct id), '{}') into v_ids from public.drivers where id = any (p_drivers);
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'no matching drivers'; end if;
  if array_length(v_ids, 1) > 200 then raise exception 'at most 200 drivers at a time'; end if;
  insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, note)
  select id, 'driver', p_amount, 'admin_adjust', p_note from unnest(v_ids) as id;
  return array_length(v_ids, 1);
end;
$$;
grant execute on function public.admin_bulk_wallet_credit(uuid[], integer, text) to authenticated;
