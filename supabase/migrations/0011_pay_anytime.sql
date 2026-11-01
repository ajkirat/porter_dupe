-- Pay-anytime: the customer no longer picks a payment method when booking.
-- Until delivery they can pay the driver by cash, UPI or QR. Pikop never handles the money.
-- paid_via is only a note ("customer says they paid"); driver earnings depend on delivery alone.
alter table public.jobs add column if not exists paid_via text check (paid_via in ('cash', 'upi', 'qr'));
alter table public.jobs add column if not exists paid_marked_at timestamptz;

create or replace function public.customer_mark_paid(p_job uuid, p_via text) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  if p_via not in ('cash', 'upi', 'qr') then raise exception 'unknown payment method'; end if;
  update public.jobs set paid_via = p_via, paid_marked_at = now()
  where id = p_job and customer_id = auth.uid()
    and status in ('requested', 'assigned', 'accepted', 'picked_up')
  returning * into v_job;
  if v_job.id is null then raise exception 'payment cannot be marked on this order'; end if;
  return v_job;
end;
$$;
grant execute on function public.customer_mark_paid(uuid, text) to authenticated;
