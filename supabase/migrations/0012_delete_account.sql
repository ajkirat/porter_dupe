-- In-app account deletion (required by Google Play and the App Store).
-- Trip records stay (the other person's history, disputes, tax), but they no longer point at a named person:
-- the profile and driver rows are blanked, saved data is removed, and the login is disabled.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if exists (
    select 1 from public.jobs
    where (customer_id = v_uid or driver_id = v_uid) and status in ('requested', 'assigned', 'accepted', 'picked_up')
  ) then
    raise exception 'finish or cancel your open trip before deleting your account';
  end if;

  delete from public.saved_routes where user_id = v_uid;
  delete from public.driver_push_tokens where driver_id = v_uid;
  delete from public.wallet_entries where user_id = v_uid;
  delete from public.driver_passes where driver_id = v_uid;

  update public.drivers set
    full_name = 'Deleted driver', phone = '', vehicle_number = 'deleted', licence_number = '', upi_id = null,
    kyc_docs = '{}'::jsonb, kyc_status = 'rejected', is_online = false, last_lat = null, last_lng = null
  where id = v_uid;
  update public.profiles set full_name = 'Deleted user', phone = null where id = v_uid;

  -- Disable the login and free the number so it can be used to sign up again later.
  update auth.users set phone = null, banned_until = 'infinity' where id = v_uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
