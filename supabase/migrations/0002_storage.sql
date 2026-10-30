-- Private bucket for driver KYC documents. Each driver uploads into a folder
-- named after their user id: kyc/<uid>/<doc>.jpg. Only that driver and admins can read.

insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

create policy "driver uploads own kyc" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "driver replaces own kyc" on storage.objects for update to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "driver or admin reads kyc" on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
