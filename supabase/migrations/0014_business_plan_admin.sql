-- 0014: admin changes from the business plan. Idempotent.
-- Support contact, service zone (stored, not enforced yet), required documents per vehicle,
-- KYC approval blocked until documents are in, admin "Today" list and cancellation counts.

alter table public.settings
  add column if not exists support_phone text,
  add column if not exists support_hours text,
  add column if not exists zone_name text not null default 'Whitefield',
  add column if not exists zone_lat numeric not null default 12.9698,
  add column if not exists zone_lng numeric not null default 77.7500,
  add column if not exists zone_pickup_km numeric not null default 5,
  add column if not exists zone_drop_km numeric not null default 8;

-- Documents (besides the basics) a driver must upload before approval.
alter table public.vehicle_types add column if not exists required_docs text[] not null default '{insurance}';
update public.vehicle_types set required_docs = '{insurance}' where code = 'bike' and required_docs = '{insurance}';
update public.vehicle_types set required_docs = '{insurance,permit}' where code <> 'bike';

create or replace function public.drivers_require_docs() returns trigger
language plpgsql as $$
declare v_req text[]; v_doc text;
begin
  if new.kyc_status = 'approved' and (tg_op = 'INSERT' or old.kyc_status is distinct from 'approved') then
    select required_docs into v_req from public.vehicle_types where code = new.vehicle_type;
    foreach v_doc in array coalesce(v_req, '{}') loop
      if coalesce(new.kyc_docs ->> v_doc, '') = '' then
        raise exception 'cannot approve: % is missing', v_doc;
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists drivers_require_docs on public.drivers;
create trigger drivers_require_docs before insert or update of kyc_status on public.drivers
  for each row execute function public.drivers_require_docs();

-- Cancellation counts (tracking only, nothing is blocked).
create or replace function public.admin_cancel_stats()
returns table (who text, id uuid, name text, phone text, cancelled bigint, total bigint)
language sql security definer set search_path = public as $$
  select 'customer', p.id, p.full_name, p.phone,
         count(*) filter (where j.status = 'cancelled'), count(*)
    from public.jobs j join public.profiles p on p.id = j.customer_id
   where public.is_admin()
   group by p.id, p.full_name, p.phone
  having count(*) filter (where j.status = 'cancelled') > 0
  union all
  select 'driver', d.id, d.full_name, d.phone,
         count(*) filter (where j.status = 'cancelled'), count(*)
    from public.jobs j join public.drivers d on d.id = j.driver_id
   where public.is_admin()
   group by d.id, d.full_name, d.phone
  having count(*) filter (where j.status = 'cancelled') > 0
  order by 5 desc;
$$;
grant execute on function public.admin_cancel_stats() to authenticated;

-- Weekly numbers from the plan.
create or replace function public.admin_weekly_metrics()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := now() - interval '7 days';
  v_total int; v_fast int; v_deliv int; v_drivers int; v_cust int; v_repeat int; v_paying int;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select count(*), count(*) filter (where accepted_at is not null and accepted_at - created_at < interval '5 minutes')
    into v_total, v_fast from public.jobs where created_at >= v_since and status <> 'cancelled';
  select count(*), count(distinct driver_id) into v_deliv, v_drivers
    from public.jobs where status = 'delivered' and delivered_at >= v_since;
  select count(distinct customer_id) into v_cust from public.jobs where created_at >= v_since;
  select count(*) into v_repeat from (
    select customer_id from public.jobs where status = 'delivered' group by customer_id having count(*) >= 2
  ) r;
  select count(distinct driver_id) into v_paying from public.driver_passes where ends_at > now() and starts_at <= now();
  return jsonb_build_object(
    'jobs_week', v_total, 'accepted_fast', v_fast, 'delivered', v_deliv, 'active_drivers', v_drivers,
    'customers_week', v_cust, 'repeat_customers', v_repeat,
    'customers_ever', (select count(distinct customer_id) from public.jobs where status = 'delivered'),
    'paying_drivers', v_paying);
end $$;
grant execute on function public.admin_weekly_metrics() to authenticated;
