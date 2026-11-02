-- 0015: referral rules from the business plan. Idempotent.
--  * A driver who refers a driver earns a fee credit once that driver finishes N trips (default 5), capped per month.
--  * A driver who refers a customer earns a fee credit once that customer has N deliveries (default 3).
--  * Customers earn nothing for referring and get no welcome credit (the customer wallet stays, switched to zero).
-- Amounts and limits stay editable in Admin -> Referrals.

alter table public.settings
  add column if not exists referral_driver_trips integer not null default 5 check (referral_driver_trips >= 1),
  add column if not exists referral_customer_trips integer not null default 3 check (referral_customer_trips >= 1);

update public.settings set
  referral_driver_reward = 150,
  referral_max_driver = 3,
  referral_customer_reward = 50,
  referral_max_customer = 10,
  referral_customer_welcome = 0
where referral_driver_trips = 5 and referral_driver_reward = 50 and referral_customer_reward = 50;  -- only if still on the old defaults

create or replace function public.pay_referral_rewards_for(new public.jobs) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  r public.referrals;
  v_paid integer;
  v_month timestamptz := date_trunc('month', now());
begin
  select * into s from public.settings;
  if new.distance_m < s.referral_min_trip_m or new.fare_rupees < s.referral_min_fare or new.customer_id = new.driver_id then return; end if;

  -- A customer referred by a DRIVER: the driver earns a fee credit after the customer's Nth delivery.
  select * into r from public.referrals where referred_id = new.customer_id and wallet = 'customer' and status = 'pending';
  if r.id is not null
     and (select count(*) from public.jobs where customer_id = new.customer_id and status = 'delivered') >= s.referral_customer_trips then
    select count(*) into v_paid from public.referrals
     where referrer_id = r.referrer_id and wallet = 'customer' and status = 'rewarded' and rewarded_at >= v_month;
    if not exists (select 1 from public.drivers where id = r.referrer_id)   -- customers earn nothing for referring
       or v_paid >= s.referral_max_customer or s.referral_customer_reward <= 0 then
      update public.referrals set status = 'capped', rewarded_at = now() where id = r.id;
    else
      insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
      values (r.referrer_id, 'driver', s.referral_customer_reward, 'referral_reward', r.referred_id,
              'A customer you referred completed ' || s.referral_customer_trips || ' deliveries');
      update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id;
    end if;
  end if;

  -- A driver referred by a driver: the referrer earns a fee credit after the new driver's Nth trip.
  if new.driver_id is not null then
    select * into r from public.referrals where referred_id = new.driver_id and wallet = 'driver' and status = 'pending';
    if r.id is not null
       and (select count(*) from public.jobs where driver_id = new.driver_id and status = 'delivered') >= s.referral_driver_trips then
      select count(*) into v_paid from public.referrals
       where referrer_id = r.referrer_id and wallet = 'driver' and status = 'rewarded' and rewarded_at >= v_month;
      if v_paid >= s.referral_max_driver or s.referral_driver_reward <= 0 then
        update public.referrals set status = 'capped', rewarded_at = now() where id = r.id;
      else
        insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
        values (r.referrer_id, 'driver', s.referral_driver_reward, 'referral_reward', r.referred_id,
                'A driver you referred completed ' || s.referral_driver_trips || ' trips');
        update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id;
      end if;
    end if;
  end if;
end;
$$;
revoke execute on function public.pay_referral_rewards_for(public.jobs) from public, anon, authenticated;
