alter policy animal_photos_delete on storage.objects
  using (
    bucket_id = 'animal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
