begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- a et b ont Plus, c ne l'a jamais eu, d l'a laissé expirer, e l'a vu désactivé, f va supprimer son compte.
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff');
insert into public.plus_entitlements (user_id, active, product_type, expires_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, 'lifetime', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true, 'annual', now() + interval '1 month'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', true, 'monthly', now() - interval '1 day'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', false, 'annual', now() + interval '1 month'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', true, 'lifetime', null);

insert into storage.objects (bucket_id, name) values
  ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/milo.jpg'),
  ('animal-photos', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/luna.jpg'),
  ('animal-photos', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/rex.jpg');

create function pg_temp.as_user(account text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', rpad('', 8, account) || '-' || rpad('', 4, account) || '-4'
      || rpad('', 3, account) || '-8' || rpad('', 3, account) || '-' || rpad('', 12, account),
      'role', 'authenticated')::text,
    true);
end;
$$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- L'API Storage lève ce verrou pour chaque suppression ; une requête SQL nue ne le lève pas.
select set_config('storage.allow_delete_query', 'true', true);

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'animal-photos' $$,
  $$ values (false, 2097152::bigint, array['image/jpeg']) $$,
  'bucket privé, 2 Mo par objet, JPEG seulement');

select is(
  (select array_agg(format('%s %s %s', policyname, cmd, roles) order by policyname)
   from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'animal_photos_%'),
  array['animal_photos_delete DELETE {authenticated}',
        'animal_photos_insert INSERT {authenticated}',
        'animal_photos_select SELECT {authenticated}',
        'animal_photos_update UPDATE {authenticated}'],
  'une politique par opération, pour authenticated seulement');

select pg_temp.as_user('a');

select results_eq(
  $$ select name from storage.objects where bucket_id = 'animal-photos' $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/milo.jpg') $$,
  'a ne liste que son dossier');
select is_empty(
  $$ select 1 from storage.objects
     where name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/luna.jpg' $$,
  'a ne lit pas une photo de b, même par son chemin exact');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/nala.jpg') $$,
  'a envoie une photo dans son dossier');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/intrus.jpg') $$,
  '42501', null, 'a n''envoie rien dans le dossier de b');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('animal-photos', 'sans-dossier.jpg') $$,
  '42501', null, 'a n''envoie rien hors d''un dossier');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('autre-bucket', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/milo.jpg') $$,
  '42501', null, 'a n''envoie rien dans un autre bucket');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.jpg') $$,
  'a envoie une photo nommée comme l''app la nomme');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vieux/rex.jpg') $$,
  '42501', null, 'a n''envoie rien dans un sous-dossier de son dossier');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa//rex.jpg') $$,
  '42501', null, 'a n''envoie rien sous un segment vide');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/rex.webp') $$,
  '42501', null, 'a n''envoie rien d''autre qu''un .jpg');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/.jpg') $$,
  '42501', null, 'a n''envoie rien sans nom avant .jpg');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/réx.jpg') $$,
  '42501', null, 'a n''envoie rien sous un nom que l''app ne produit pas');
select throws_ok(
  $$ update storage.objects set name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vieux/milo.jpg'
     where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/milo.jpg' $$,
  '42501', null, 'a ne range pas sa photo dans un sous-dossier');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a.jpg' || E'\n') $$,
  '42501', null, 'a n''envoie rien sous un nom suivi d''un retour à la ligne');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a.JPG') $$,
  '42501', null, 'a n''envoie rien en .JPG');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a.jpg/') $$,
  '42501', null, 'a n''envoie rien sous un nom à barre finale');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a' || chr(1) || '.jpg') $$,
  '42501', null, 'a n''envoie rien sous un nom à caractère de contrôle');

select pg_temp.as_owner();
insert into storage.objects (bucket_id, name)
  values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vieux/rex.webp');
select pg_temp.as_user('a');
select results_eq(
  $$ select name from storage.objects
     where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vieux/rex.webp' $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vieux/rex.webp') $$,
  'un ancien objet d''une autre forme reste lisible par a');
select results_eq(
  $$ delete from storage.objects
     where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vieux/rex.webp' returning name $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vieux/rex.webp') $$,
  'un ancien objet d''une autre forme reste effaçable par a');

select is_empty(
  $$ update storage.objects set name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/volee.jpg'
     where name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/luna.jpg' returning name $$,
  'a ne déplace pas une photo de b');
select throws_ok(
  $$ update storage.objects set name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/milo.jpg'
     where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/milo.jpg' $$,
  '42501', null, 'a ne pousse pas sa photo dans le dossier de b');
select is_empty(
  $$ delete from storage.objects
     where name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/luna.jpg' returning name $$,
  'a ne supprime pas une photo de b');
select results_eq(
  $$ delete from storage.objects
     where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/nala.jpg' returning name $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/nala.jpg') $$,
  'a supprime une photo de son dossier');

select pg_temp.as_user('c');

select results_eq(
  $$ select name from storage.objects where bucket_id = 'animal-photos' $$,
  $$ values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc/rex.jpg') $$,
  'sans Plus, c lit encore son dossier, pour restaurer son carnet');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/nouvelle.jpg') $$,
  '42501', null, 'sans Plus, c n''envoie pas de photo');
select throws_ok(
  $$ update storage.objects set name = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/renommee.jpg'
     where name = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/rex.jpg' $$,
  '42501', null, 'sans Plus, c ne remplace pas sa photo');
select is_empty(
  $$ delete from storage.objects
     where name = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/rex.jpg' returning name $$,
  'sans Plus, c ne supprime pas sa photo');

select pg_temp.as_user('d');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd/photo.jpg') $$,
  '42501', null, 'Plus expiré : pas d''envoi');

select pg_temp.as_user('e');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/photo.jpg') $$,
  '42501', null, 'Plus désactivé : pas d''envoi');

select pg_temp.as_user('f');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'ffffffff-ffff-4fff-8fff-ffffffffffff/avant.jpg') $$,
  'f envoie une photo tant que son compte existe');

select pg_temp.as_owner();
delete from auth.users where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
select is_empty(
  $$ select 1 from public.plus_entitlements where user_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' $$,
  'le droit Plus part avec le compte');

-- Le jeton d'un second téléphone reste signé jusqu'à une heure après la suppression du compte.
select pg_temp.as_user('f');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'ffffffff-ffff-4fff-8fff-ffffffffffff/apres.jpg') $$,
  '42501', null, 'compte supprimé, jeton encore valide : pas d''envoi');
select throws_ok(
  $$ update storage.objects set name = 'ffffffff-ffff-4fff-8fff-ffffffffffff/apres.jpg'
     where name = 'ffffffff-ffff-4fff-8fff-ffffffffffff/avant.jpg' $$,
  '42501', null, 'compte supprimé, jeton encore valide : pas de remplacement');

select pg_temp.as_owner();
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is_empty($$ select 1 from storage.objects where bucket_id = 'animal-photos' $$,
  'anon ne voit aucune photo');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('animal-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/anon.jpg') $$,
  '42501', null, 'anon n''envoie rien');

select pg_temp.as_owner();
select results_eq(
  $$ select name from storage.objects where bucket_id = 'animal-photos' order by name $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.jpg'),
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/milo.jpg'),
            ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/luna.jpg'),
            ('cccccccc-cccc-4ccc-8ccc-cccccccccccc/rex.jpg'),
            ('ffffffff-ffff-4fff-8fff-ffffffffffff/avant.jpg') $$,
  'seuls les gestes permis ont touché aux photos');

select * from finish();
rollback;
