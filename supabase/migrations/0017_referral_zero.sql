-- 0017: 0 is allowed in every referral field. Deliveries = 0 means "no deliveries needed":
-- the referrer (and the new person, if their credit is timed to deliveries) are paid the moment the code is added.
-- For Pikop bonuses, 0 means "on their first delivery". Idempotent.

alter table public.referral_rules drop constraint if exists referral_rules_trips_check;
alter table public.referral_rules add constraint referral_rules_trips_check check (trips >= 0);

-- Pay out one waiting referral under its flow's rules.
create or replace function public.referral_payout(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.referrals; rule public.referral_rules; v_paid integer; v_wallet text;
begin
  select * into r from public.referrals where id = p_id and status = 'pending';
  if r.id is null then return; end if;
  select * into rule from public.referral_rules where flow = r.flow;
  if rule.flow is null or not rule.enabled then
    update public.referrals set status = 'capped', rewarded_at = now() where id = r.id;
    return;
  end if;
  select count(*) into v_paid from public.referrals
   where referrer_id = r.referrer_id and flow = r.flow and status = 'rewarded' and rewarded_at >= date_trunc('month', now());
  if v_paid >= rule.monthly_cap or rule.referrer_reward <= 0 then
    update public.referrals set status = 'capped', rewarded_at = now() where id = r.id;
  else
    v_wallet := case when exists (select 1 from public.drivers where id = r.referrer_id) then 'driver' else 'customer' end;
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
    values (r.referrer_id, v_wallet, rule.referrer_reward, 'referral_reward', r.referred_id,
            case when rule.trips = 0 then 'Someone you referred joined'
                 else 'Someone you referred completed ' || rule.trips || ' deliveries' end)
    on conflict do nothing;
    update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id;
  end if;
  if rule.referred_when = 'trips' and rule.referred_reward > 0 then
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
    values (r.referred_id, r.wallet, rule.referred_reward, 'referral_welcome', r.referrer_id, 'Welcome credit')
    on conflict do nothing;
  end if;
end $$;

create or replace function public.referral_step(p_user uuid, p_wallet text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.referrals; rule public.referral_rules; v_n integer; v_created timestamptz;
begin
  v_n := case when p_wallet = 'driver'
    then (select count(*) from public.jobs where driver_id = p_user and status = 'delivered')
    else (select count(*) from public.jobs where customer_id = p_user and status = 'delivered') end;

  select * into r from public.referrals where referred_id = p_user and wallet = p_wallet and status = 'pending';
  if r.id is not null then
    select * into rule from public.referral_rules where flow = r.flow;
    if rule.flow is null or not rule.enabled or v_n >= rule.trips then perform public.referral_payout(r.id); end if;
    return;
  end if;

  -- No referral: Pikop's own bonus, once per person, only for people who joined after the rule was switched on.
  if exists (select 1 from public.referrals where referred_id = p_user and wallet = p_wallet) then return; end if;
  select * into rule from public.referral_rules where flow = 'pikop_' || p_wallet;
  if rule.flow is null or not rule.enabled or rule.referred_reward <= 0 or rule.starts_at is null or v_n < rule.trips then return; end if;
  v_created := case when p_wallet = 'driver' then (select created_at from public.drivers where id = p_user)
                    else (select created_at from public.profiles where id = p_user) end;
  if v_created is null or v_created < rule.starts_at then return; end if;
  if exists (select 1 from public.wallet_entries where user_id = p_user and wallet = p_wallet and kind = 'pikop_welcome') then return; end if;
  insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, note)
  values (p_user, p_wallet, rule.referred_reward, 'pikop_welcome', 'Welcome bonus from Pikop');
end $$;

create or replace function public.apply_referral_code(p_code text, p_wallet text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_referrer uuid; v_flow text; r public.referral_rules; v_welcome integer := 0; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_wallet not in ('customer', 'driver') then raise exception 'invalid wallet'; end if;
  select id into v_referrer from public.profiles where referral_code = upper(trim(p_code));
  if v_referrer is null then raise exception 'That referral code was not found'; end if;
  if v_referrer = auth.uid() then raise exception 'You cannot use your own code'; end if;
  if exists (select 1 from public.referrals where referred_id = auth.uid() and wallet = p_wallet) then
    raise exception 'You have already used a referral code';
  end if;
  v_flow := (case when exists (select 1 from public.drivers where id = v_referrer) then 'driver' else 'customer' end) || '_' || p_wallet;
  select * into r from public.referral_rules where flow = v_flow;
  if r.flow is null or not r.enabled then raise exception 'Referrals are switched off right now'; end if;

  if p_wallet = 'driver' then
    if not exists (select 1 from public.drivers where id = auth.uid()) then raise exception 'Sign up as a driver first'; end if;
    if exists (select 1 from public.jobs where driver_id = auth.uid() and status = 'delivered') then
      raise exception 'Referral codes only work before your first delivery';
    end if;
  else
    if exists (select 1 from public.jobs where customer_id = auth.uid()) then
      raise exception 'Referral codes only work before your first booking';
    end if;
  end if;

  insert into public.referrals (referrer_id, referred_id, wallet, flow) values (v_referrer, auth.uid(), p_wallet, v_flow)
  returning id into v_id;
  if r.referred_when = 'signup' and r.referred_reward > 0 then
    insert into public.wallet_entries (user_id, wallet, amount_rupees, kind, ref_user, note)
    values (auth.uid(), p_wallet, r.referred_reward, 'referral_welcome', v_referrer, 'Welcome credit');
    v_welcome := r.referred_reward;
  end if;
  -- No deliveries needed: settle now.
  if r.trips = 0 then perform public.referral_payout(v_id); end if;
  return v_welcome;
end $$;

revoke execute on function public.referral_payout(uuid), public.referral_step(uuid, text) from public, anon, authenticated;
