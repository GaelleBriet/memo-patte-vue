begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Comptes : a et b ont Plus, c ne l'a jamais eu, d l'a perdu.
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
insert into public.plus_entitlements (user_id, active, product_type, expires_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, 'lifetime', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true, 'annual', now() + interval '1 month'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', true, 'monthly', now() + interval '1 month');

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

create temp table mirror (name text primary key);
insert into mirror values
  ('animal'), ('weight_entry'), ('carnet_settings'), ('vaccination'), ('vaccination_injection'),
  ('treatment'), ('treatment_period'), ('treatment_dose'), ('device');
grant select on mirror to authenticated, anon;

-- Une ligne par miroir sous le compte donné, chacune avec un server_updated_at forgé.
create function pg_temp.carnet_of(account uuid) returns text language sql as $fn$
  select format($$
  insert into public.animal (user_id, id, name, species, birth_date_approximate, departure_reason,
    created_at, updated_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a1', 'Luna',
    'cat', 1, 'rehomed', '2026-01-01T00:00:00Z', now() + interval '3 days', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.weight_entry (user_id, id, animal_id, weight_kg, measured_on, created_at, updated_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a2',
    '00000000-0000-4000-8000-0000000000a1', 4.2, '2026-01-01', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.carnet_settings (user_id, id, vaccine_reminder_time, remind_before_due, created_at, updated_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-0000-0000-000000000000', '18:30', 0, now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.vaccination (user_id, id, animal_id, name, planned_due_date, created_at, updated_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a3',
    '00000000-0000-4000-8000-0000000000a1', 'Typhus', '2026-06-01', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.vaccination_injection (user_id, id, vaccination_id, animal_id, injected_on, created_at, updated_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a4',
    '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a1', '2026-01-01', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.treatment (user_id, id, animal_id, name, type, created_at, updated_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a5',
    '00000000-0000-4000-8000-0000000000a1', 'Amoxicilline', 'medication', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.treatment_period (user_id, id, treatment_id, animal_id, starts_on, first_due_on,
    grid_origin_on, ends_on, frequency_value, frequency_unit, times, dose_quantity, dose_unit, reminder_offset_minutes,
    created_at, updated_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a6',
    '00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000a1', '2026-01-01',
    '2026-01-01', '2026-01-01', '2026-01-10', 1, 'day', '08:00,20:00', 0.5, 'tablet', 15, now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.treatment_dose (user_id, id, period_id, treatment_id, animal_id, due_on, due_time,
    given_on, status, target_on, created_at, updated_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a7',
    '00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a5',
    '00000000-0000-4000-8000-0000000000a1', '2026-01-01', '08:00', null, 'missed', null, now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.device (user_id, id, model, installed_at, created_at, updated_at, server_updated_at)
  values ('%1$s', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Pixel 8', now(), now(), now(), '2001-01-01T00:00:00Z');
$$, account);
$fn$;
create temp table carnet as
  select account, pg_temp.carnet_of(account) as inserts
  from (values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid), ('dddddddd-dddd-4ddd-8ddd-dddddddddddd')) as owner (account);
grant select on carnet to authenticated;

-- Structure : RLS forcée, politiques par opération, droits minimaux.
select is(
  (select count(*)::int from pg_class c join mirror m on c.oid = ('public.' || m.name)::regclass
   where c.relrowsecurity and c.relforcerowsecurity),
  9, 'RLS activée et forcée sur les neuf miroirs');

select is(
  (select array_agg(cmd order by cmd) from pg_policies
   where schemaname = 'public' and tablename = m.name),
  array['INSERT', 'SELECT', 'UPDATE'],
  m.name || ' : une politique par opération, aucune pour la suppression')
from mirror m;

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename in (select name from mirror)
     and roles <> '{authenticated}'),
  0, 'chaque politique ne vaut que pour authenticated');

select is(
  (select count(*)::int from mirror m, unnest(array[
     'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege
   where has_table_privilege('anon', 'public.' || m.name, privilege)
      or has_any_column_privilege('anon', 'public.' || m.name, 'SELECT, INSERT, UPDATE')),
  0, 'anon n''a aucun droit sur les miroirs');

select is(
  (select count(*)::int from mirror m, unnest(array[
     'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'UPDATE']) privilege
   where has_table_privilege('authenticated', 'public.' || m.name, privilege)),
  0, 'authenticated ne supprime pas, ne vide pas, et ne modifie pas toute colonne');

select is(
  (select count(*)::int from mirror m, unnest(array['user_id', 'id', 'server_updated_at']) col
   where has_column_privilege('authenticated', 'public.' || m.name, col, 'UPDATE')),
  0, 'user_id, id et server_updated_at ne sont pas modifiables');

select is(
  (select count(*)::int from mirror m
   where has_table_privilege('authenticated', 'public.' || m.name, 'SELECT')
     and has_table_privilege('authenticated', 'public.' || m.name, 'INSERT')
     and has_column_privilege('authenticated', 'public.' || m.name, 'updated_at', 'UPDATE')),
  9, 'authenticated lit, crée et met à jour');

select is(
  (select count(*)::int from pg_constraint k join mirror m on k.conrelid = ('public.' || m.name)::regclass
   where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype = 'c'),
  9, 'chaque miroir référence auth.users avec on delete cascade');

select is(
  (select count(*)::int from pg_constraint k join mirror m on k.conrelid = ('public.' || m.name)::regclass
   where k.contype = 'f' and k.confrelid <> 'auth.users'::regclass
     and (select attname from pg_attribute where attrelid = k.conrelid and attnum = k.conkey[1]) = 'user_id'
     and (select attname from pg_attribute where attrelid = k.confrelid and attnum = k.confkey[1]) = 'user_id'),
  10, 'les dix clés étrangères entre miroirs portent le user_id');

select is(
  (select count(*)::int from pg_constraint k join mirror m on k.conrelid = ('public.' || m.name)::regclass
   where k.contype = 'f' and k.confrelid <> 'auth.users'::regclass),
  10, 'aucune clé étrangère entre miroirs sans user_id');

select ok(
  (select prosecdef and proconfig = array['search_path=""'] from pg_proc
   where oid = 'public.has_active_plus()'::regprocedure),
  'has_active_plus : security definer, search_path fixé');
select ok(
  (select not prosecdef and proconfig = array['search_path=""'] from pg_proc
   where oid = 'public.clamp_sync_timestamps()'::regprocedure),
  'clamp_sync_timestamps : security invoker, search_path fixé');
select ok(not has_function_privilege('anon', 'public.has_active_plus()', 'EXECUTE'),
  'anon n''appelle pas has_active_plus');
select ok(not has_function_privilege('authenticated', 'public.clamp_sync_timestamps()', 'EXECUTE'),
  'clamp_sync_timestamps n''est pas appelable en RPC');

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
   where oid = 'public.plus_entitlements'::regclass),
  'plus_entitlements : RLS activée et forcée');
select is(
  (select array_agg(privilege order by privilege)
   from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege
   where has_table_privilege('authenticated', 'public.plus_entitlements', privilege)),
  array['SELECT'], 'plus_entitlements : authenticated ne fait que lire');
select ok(
  not has_table_privilege('anon', 'public.plus_entitlements',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  and not has_any_column_privilege('anon', 'public.plus_entitlements', 'SELECT, INSERT, UPDATE')
  and not has_any_column_privilege('authenticated', 'public.plus_entitlements', 'INSERT, UPDATE'),
  'plus_entitlements : anon n''a aucun droit, authenticated aucun droit de colonne en écriture');

-- Un compte Plus écrit et relit son carnet.
select pg_temp.as_user('a');

select lives_ok((select inserts from carnet where account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'un compte Plus écrit une ligne dans chaque miroir');

select is(
  (select array[(select count(*) from public.animal), (select count(*) from public.weight_entry),
     (select count(*) from public.carnet_settings), (select count(*) from public.vaccination),
     (select count(*) from public.vaccination_injection), (select count(*) from public.treatment),
     (select count(*) from public.treatment_period), (select count(*) from public.treatment_dose),
     (select count(*) from public.device)]),
  array[1, 1, 1, 1, 1, 1, 1, 1, 1]::bigint[], 'il relit ses lignes');

select results_eq(
  format($$ select server_updated_at > now() - interval '1 minute' from public.%I $$, name),
  $$ values (true) $$, name || ' : le serveur réécrit un server_updated_at forgé')
from mirror;

select ok((select updated_at <= now() from public.animal),
  'le serveur écrête un updated_at trop loin dans le futur');

select lives_ok($$
  update public.treatment_period set stopped_on = '2026-01-05', updated_at = now()
  where id = '00000000-0000-4000-8000-0000000000a6'
$$, 'il met à jour sa ligne');

select throws_ok($$ update public.animal set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  '42501', null, 'il ne change pas le user_id d''une ligne');
select throws_ok($$ delete from public.animal $$, '42501', null, 'il ne supprime pas');
select throws_ok($$ delete from public.carnet_settings $$, '42501', null,
  'il ne supprime pas ses réglages');

select is((select count(*) from public.plus_entitlements), 1::bigint, 'il ne lit que son droit Plus');
select throws_ok($$ update public.plus_entitlements set expires_at = null $$, '42501', null,
  'il ne modifie pas son droit Plus');
select throws_ok($$ truncate public.plus_entitlements $$, '42501', null, 'il ne vide pas la table des droits');

-- Listes fermées et limites du schéma local.
select throws_ok(format($$
  insert into public.animal (user_id, id, name, species, created_at, updated_at,
    created_by_device, updated_by_device)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), %s, %L, now(), now(),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
$$, name, species), '23514', null, label)
from (values
  ('''Rex''', 'rabbit', 'espèce hors liste refusée'),
  ('repeat(''x'', 81)', 'dog', 'nom de plus de 80 caractères refusé')
) as bad (name, species, label);

select throws_ok(format($$ update public.animal set %s $$, change), '23514', null, label)
from (values
  ('birth_date_approximate = 2', 'date approximative hors 0 / 1 refusée'),
  ('departure_reason = ''lost''', 'motif de départ hors liste refusé'),
  ('breed = repeat(''x'', 81)', 'race de plus de 80 caractères refusée')
) as bad (change, label);

select throws_ok(format($$ update public.treatment set %s $$, change), '23514', null, label)
from (values
  ('type = ''vitamin''', 'type de traitement hors liste refusé'),
  ('name = repeat(''x'', 81)', 'nom de traitement de plus de 80 caractères refusé')
) as bad (change, label);

select throws_ok($$ update public.vaccination set name = repeat('x', 81) $$, '23514', null,
  'nom de vaccin de plus de 80 caractères refusé');

select throws_ok(format($$ update public.treatment_period set %s $$, change), '23514', null, label)
from (values
  ('dose_unit = ''spoon''', 'unité de dose hors liste refusée'),
  ('reminder_offset_minutes = 45', 'moment du rappel hors liste refusé'),
  ('frequency_value = 0', 'fréquence nulle refusée'),
  ('frequency_unit = ''year''', 'unité de fréquence hors liste refusée'),
  ('first_due_chosen = 2', 'date choisie hors 0 / 1 refusée'),
  ('past_doses_stay_unlogged = 2', 'réponse « Elles restent à renseigner » hors 0 / 1 refusée')
) as bad (change, label);

select throws_ok($$ update public.treatment_dose set status = 'skipped' $$, '23514', null,
  'état de prise hors liste refusé');

select lives_ok($$
  update public.treatment_dose set status = 'extra', given_on = '2026-01-01', updated_at = now();
  update public.treatment_dose set status = 'shift', given_on = null, updated_at = now();
$$, 'prise en plus et ligne de décalage acceptées');

select throws_ok($$ update public.device set model = repeat('x', 201) $$, '23514', null,
  'modèle d''appareil de plus de 200 caractères refusé');

select throws_ok(format($$ update public.carnet_settings set %s $$, change), '23514', null, label)
from (values
  ('vaccine_reminder_time = ''24:00''', 'heure des rappels invalide refusée'),
  ('remind_before_due = 2', 'prévenance hors 0 / 1 refusée')
) as bad (change, label);

select throws_ok($$
  insert into public.carnet_settings (user_id, id, created_at, updated_at, created_by_device,
    updated_by_device)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
$$, '23514', null, 'une seule ligne de réglages par compte');

-- Un autre compte Plus ne voit ni ne touche ces lignes.
select pg_temp.as_user('b');

select is(
  (select (select count(*) from public.animal) + (select count(*) from public.weight_entry)
     + (select count(*) from public.carnet_settings) + (select count(*) from public.vaccination)
     + (select count(*) from public.vaccination_injection) + (select count(*) from public.treatment)
     + (select count(*) from public.treatment_period) + (select count(*) from public.treatment_dose)
     + (select count(*) from public.device)),
  0::bigint, 'un autre compte ne lit aucune ligne');

select is_empty(format(
  $$ update public.%I set updated_at = now() + interval '1 hour' returning 1 $$, name),
  name || ' : un autre compte ne modifie aucune ligne')
from mirror;

select throws_ok(format($$
  insert into public.%I (user_id, id, created_at, updated_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', now(), now())
$$, name), '42501', null, name || ' : il n''écrit pas sous le user_id d''un autre')
from mirror;

select throws_ok($$
  insert into public.carnet_settings (user_id, id, created_at, updated_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', now(), now())
  on conflict (user_id, id) do update set vaccine_reminder_time = '07:00'
$$, '42501', null, 'il n''écrase pas les réglages d''un autre');

select throws_ok($$
  insert into public.weight_entry (user_id, id, animal_id, weight_kg, measured_on, created_at, updated_at,
    created_by_device, updated_by_device)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', gen_random_uuid(),
    '00000000-0000-4000-8000-0000000000a1', 9, '2026-01-01', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
$$, '23503', null, 'il ne rattache pas une pesée à l''animal d''un autre');

select throws_ok($$
  insert into public.treatment_period (user_id, id, treatment_id, animal_id, starts_on, first_due_on,
    grid_origin_on, frequency_value, frequency_unit, created_at, updated_at, created_by_device,
    updated_by_device)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', gen_random_uuid(),
    '00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000a1', '2026-01-01',
    '2026-01-01', '2026-01-01', 1, 'day', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
$$, '23503', null, 'il ne rattache pas une période au traitement d''un autre');

select lives_ok($$
  insert into public.animal (user_id, id, name, species, created_at, updated_at, created_by_device,
    updated_by_device)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000a1', 'Milo', 'dog',
    now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  insert into public.carnet_settings (user_id, id, created_at, updated_at, created_by_device,
    updated_by_device)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', now(), now(),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  insert into public.device (user_id, id, installed_at, created_at, updated_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now(), now(), now());
$$, 'il écrit son propre carnet et son appareil, avec les mêmes identifiants');

-- Sans Plus : lecture seule.
select pg_temp.as_user('c');

select throws_ok(format($$
  insert into public.%I (user_id, id, created_at, updated_at)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', now(), now())
$$, name), '42501', null, name || ' : un compte sans Plus ne crée rien')
from mirror;

select pg_temp.as_user('d');
select lives_ok((select inserts from carnet where account = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'tant que Plus est actif, le compte écrit');

select pg_temp.as_owner();
update public.plus_entitlements set expires_at = now() - interval '1 day'
where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select pg_temp.as_user('d');

select throws_ok(format($$ update public.%I set updated_at = now() $$, name), '42501', null,
  name || ' : Plus expiré, plus de mise à jour')
from mirror;
select throws_ok($$
  insert into public.animal (user_id, id, name, species, created_at, updated_at)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', gen_random_uuid(), 'Simba', 'cat', now(), now())
$$, '42501', null, 'Plus expiré : plus de création');
select is((select name from public.animal), 'Luna', 'Plus expiré : la lecture reste possible');

select throws_ok($$
  insert into public.plus_entitlements (user_id, active, product_type)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', true, 'lifetime')
$$, '42501', null, 'personne ne s''accorde Plus');

-- Sans session.
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '', true);
select throws_ok(format($$ select 1 from public.%I $$, name), '42501', null,
  name || ' : anon ne lit pas')
from mirror;
select throws_ok($$ select public.has_active_plus() $$, '42501', null, 'anon n''appelle pas has_active_plus');
select throws_ok($$ select 1 from public.plus_entitlements $$, '42501', null, 'anon ne lit pas les droits Plus');

-- La suppression d'un compte efface ses lignes, et seulement les siennes.
select pg_temp.as_owner();
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is(
  (select array[(select count(*) from public.animal), (select count(*) from public.weight_entry),
     (select count(*) from public.carnet_settings), (select count(*) from public.vaccination),
     (select count(*) from public.vaccination_injection), (select count(*) from public.treatment),
     (select count(*) from public.treatment_period), (select count(*) from public.treatment_dose),
     (select count(*) from public.device),
     (select count(*) from public.plus_entitlements where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')]),
  array[2, 1, 2, 1, 1, 1, 1, 1, 2, 0]::bigint[],
  'compte supprimé : ses lignes partent en cascade, celles des autres restent');

-- Conversion de la migration v12 rejouée : colonnes remises à l'état v11, cas limites, puis le corps de la migration.
select pg_temp.as_owner();
alter table public.treatment_period rename column grid_origin_on to reference_on;
alter table public.treatment_period alter column reference_on set not null;
alter table public.treatment_dose rename column target_on to next_due_date;
alter table public.treatment_dose alter column next_due_date set not null;

insert into public.device (user_id, id, installed_at, created_at, updated_at)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now(), now(), now());
insert into public.animal (user_id, id, name, species, created_at, updated_at, created_by_device, updated_by_device)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000c1', 'Luna', 'cat', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
insert into public.treatment (user_id, id, animal_id, name, type, created_at, updated_at, created_by_device, updated_by_device)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'Mensuel', 'antiparasitic', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', 'Quotidien', 'medication', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
insert into public.treatment_period (user_id, id, treatment_id, animal_id, starts_on, first_due_on,
  reference_on, frequency_value, frequency_unit, created_at, updated_at, created_by_device, updated_by_device)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', '2026-01-31', '2026-02-28', '2026-01-31', 1, 'month', now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', '2026-01-01', '2026-01-01', '2026-01-01', 1, 'day', now() - interval '2 hours', now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', '2026-02-01', '2026-02-01', '2026-01-01', 1, 'day', now() - interval '1 hour', now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
alter table public.treatment_period rename column reference_on to grid_origin_on;
alter table public.treatment_period alter column grid_origin_on drop not null;

alter table public.treatment_dose rename column next_due_date to target_on;
alter table public.treatment_dose alter column target_on drop not null;

-- Un réglage remplacé avant son premier jour cède sa place au réglage écrit après lui ; les réglages
-- d'un traitement supprimé se rangent avec ceux supprimés au même instant.
with keyed as (
  select
    p.user_id, p.id, p.treatment_id, p.deleted_at, p.created_at, p.first_due_on,
    p.grid_origin_on as reference_on, p.stopped_on, p.frequency_value, p.frequency_unit,
    least(p.starts_on, coalesce((
      select min(newer.starts_on) from public.treatment_period newer
      where newer.user_id = p.user_id and newer.treatment_id = p.treatment_id
        and newer.deleted_at is not distinct from p.deleted_at
        and newer.created_at > p.created_at), p.starts_on)) as start_key
  from public.treatment_period p
),
ordered as (
  select keyed.*, lag(keyed.id) over (
    partition by keyed.user_id, keyed.treatment_id, keyed.deleted_at
    order by keyed.start_key, keyed.created_at, keyed.id) as previous_id
  from keyed
),
converted as (
  select o.user_id, o.id,
    case
      when previous.id is not null and previous.stopped_on is null
        and previous.frequency_value = o.frequency_value
        and previous.frequency_unit = o.frequency_unit
        and previous.reference_on = o.reference_on then null
      when case o.frequency_unit
        when 'day' then (o.first_due_on - o.reference_on) % o.frequency_value = 0
        when 'week' then (o.first_due_on - o.reference_on) % (7 * o.frequency_value) = 0
        else ((extract(year from o.first_due_on) * 12 + extract(month from o.first_due_on))
            - (extract(year from o.reference_on) * 12 + extract(month from o.reference_on)))::integer
            % o.frequency_value = 0
          and extract(day from o.first_due_on) = least(
            extract(day from o.reference_on),
            extract(day from (date_trunc('month', o.first_due_on) + interval '1 month - 1 day')))
      end then o.reference_on
      else o.first_due_on
    end as grid_origin_on
  from ordered o
  left join keyed previous on previous.user_id = o.user_id and previous.id = o.previous_id
)
update public.treatment_period period
set grid_origin_on = converted.grid_origin_on
from converted
where period.user_id = converted.user_id and period.id = converted.id
  and period.grid_origin_on is distinct from converted.grid_origin_on;

update public.treatment_dose
set target_on = null
where status not in ('postponed', 'shift') and target_on is not null;

select is(
  (select grid_origin_on from public.treatment_period where id = '00000000-0000-4000-8000-0000000000e1'),
  '2026-01-31'::date, 'mensuel du 31 : la référence qui tombe sur le rythme est conservée');
select is(
  (select grid_origin_on from public.treatment_period where id = '00000000-0000-4000-8000-0000000000e2'),
  '2026-01-01'::date, 'premier réglage : sa référence est gardée');
select is(
  (select grid_origin_on from public.treatment_period where id = '00000000-0000-4000-8000-0000000000e3'),
  null::date, 'réglage de même origine que le précédent : origine vide (hérite)');

-- Faits de la migration v13 rejoués : colonnes retirées, puis le corps de la migration.
alter table public.treatment_period
  drop column first_due_chosen,
  drop column past_doses_stay_unlogged;

alter table public.treatment_period
  add column first_due_chosen smallint not null default 0 check (first_due_chosen in (0, 1)),
  add column past_doses_stay_unlogged smallint not null default 0
    check (past_doses_stay_unlogged in (0, 1));

grant update (first_due_chosen, past_doses_stay_unlogged)
  on table public.treatment_period to authenticated;

update public.treatment_period
set first_due_chosen = 1
where grid_origin_on is not null;

select results_eq(
  $$ select id::text, first_due_chosen::int, past_doses_stay_unlogged::int
     from public.treatment_period
     where id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e3')
     order by id $$,
  $$ values ('00000000-0000-4000-8000-0000000000e1', 1, 0),
            ('00000000-0000-4000-8000-0000000000e3', 0, 0) $$,
  'v13 : une origine posée se lit comme une date choisie ; aucune réponse gardée');
select ok(
  has_column_privilege('authenticated', 'public.treatment_period', 'first_due_chosen', 'UPDATE')
    and has_column_privilege('authenticated', 'public.treatment_period',
      'past_doses_stay_unlogged', 'UPDATE'),
  'v13 : les deux faits se synchronisent');

select * from finish();
rollback;
