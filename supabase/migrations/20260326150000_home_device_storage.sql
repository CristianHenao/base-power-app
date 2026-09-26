-- Supabase Storage bucket for home device outline thumbnails.
-- Paths: {user_id}/{client_key}.png — owner-only write; public read for <img>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'home-devices',
  'home-devices',
  true,
  2621440,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Clean re-runs
drop policy if exists "Home device images are publicly readable"
  on storage.objects;
drop policy if exists "Users can upload own home device images"
  on storage.objects;
drop policy if exists "Users can update own home device images"
  on storage.objects;
drop policy if exists "Users can delete own home device images"
  on storage.objects;

create policy "Home device images are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'home-devices');

create policy "Users can upload own home device images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'home-devices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own home device images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'home-devices'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'home-devices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own home device images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'home-devices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
