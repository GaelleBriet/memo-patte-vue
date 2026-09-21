insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('animal-photos', 'animal-photos', false, 2097152, array['image/jpeg', 'image/webp']);

create policy animal_photos_select on storage.objects for select
  to authenticated
  using (
    bucket_id = 'animal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy animal_photos_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'animal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_active_plus()
  );

create policy animal_photos_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'animal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'animal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_active_plus()
  );

create policy animal_photos_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'animal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_active_plus()
  );
