update storage.buckets
set allowed_mime_types = array['image/jpeg']
where id = 'animal-photos';

alter policy animal_photos_insert on storage.objects
  with check (
    bucket_id = 'animal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) ~ '^[A-Za-z0-9_-]+\.jpg$'
    and public.has_active_plus()
  );

alter policy animal_photos_update on storage.objects
  with check (
    bucket_id = 'animal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) ~ '^[A-Za-z0-9_-]+\.jpg$'
    and public.has_active_plus()
  );
