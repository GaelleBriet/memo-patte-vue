begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Sophie demande par e-mail d'effacer sa sauvegarde ; Paul n'a rien demandé.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sophie@exemple.test'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'paul@exemple.test');
insert into public.plus_entitlements (user_id, active, product_type, expires_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, 'annual', now() + interval '1 month'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', true, 'annual', now() + interval '1 month');

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
    created_at, updated_at, settings_written_at, grid_written_at, created_by_device, updated_by_device,
    server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a6',
    '00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000a1', '2026-01-01',
    '2026-01-01', '2026-01-01', '2026-01-10', 1, 'day', '08:00,20:00', 0.5, 'tablet', 15, now(), now(), now() + interval '3 days', now() + interval '3 days', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.treatment_dose (user_id, id, period_id, treatment_id, animal_id, due_on, due_time,
    given_on, status, target_on, created_at, updated_at, decided_at, created_by_device, updated_by_device, server_updated_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a7',
    '00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a5',
    '00000000-0000-4000-8000-0000000000a1', '2026-01-01', '08:00', null, 'missed', null, now(), now(), now(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '2001-01-01T00:00:00Z');
  insert into public.device (user_id, id, model, installed_at, created_at, updated_at, server_updated_at)
  values ('%1$s', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Pixel 8', now(), now(), now(), '2001-01-01T00:00:00Z');
  insert into public.sync_push (user_id, id, sent_at)
  values ('%1$s', '00000000-0000-4000-8000-0000000000a8', now());
$$, account);
$fn$;
do $$
begin
  execute pg_temp.carnet_of('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  execute pg_temp.carnet_of('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
end
$$;

create temp table backup (name text primary key);
insert into backup values
  ('animal'), ('weight_entry'), ('carnet_settings'), ('vaccination'), ('vaccination_injection'),
  ('treatment'), ('treatment_period'), ('treatment_dose'), ('device'), ('sync_push');

-- Droits exacts de la production : la base locale accorde tout à service_role, la production non.
do $$
declare
  t text;
begin
  for t in select name from backup loop
    execute format('revoke all on table public.%I from service_role', t);
    execute format('grant references, trigger, truncate on table public.%I to service_role', t);
  end loop;
end
$$;

create function pg_temp.rows_of(account uuid) returns table (name text, n int) language plpgsql as $$
declare
  t text;
begin
  for t in select b.name from backup b order by b.name loop
    name := t;
    execute format('select count(*)::int from public.%I where user_id = $1', t) into n using account;
    return next;
  end loop;
end;
$$;

select set_eq(
  $$ select n.nspname || '.' || cl.relname
     from pg_constraint c
     join pg_class cl on cl.oid = c.conrelid
     join pg_namespace n on n.oid = cl.relnamespace
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname <> 'auth' $$,
  $$ select 'public.' || name from backup
     union select 'public.plus_entitlements' union select 'public.account_purge_notice' $$,
  'toute table d''un compte est soit de la sauvegarde, soit le droit Plus ou l''avis de purge : une nouvelle table se range ici et dans delete_cloud_backup');

select ok(
  (select prosecdef from pg_proc where oid = 'public.account_id_by_email(text)'::regprocedure),
  'account_id_by_email lit auth.users avec les droits de son propriétaire');
select ok(
  (select prosecdef from pg_proc where oid = 'public.delete_cloud_backup(uuid)'::regprocedure),
  'delete_cloud_backup efface avec les droits de son propriétaire, sans droit de table pour service_role');
select is(
  (select proconfig from pg_proc where oid = 'public.delete_cloud_backup(uuid)'::regprocedure),
  array['search_path=""', 'row_security=off'],
  'delete_cloud_backup ne résout aucun nom par un schéma de l''appelant et refuse d''être filtrée par les règles d''accès');
select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) role,
        unnest(array['public.account_id_by_email(text)', 'public.delete_cloud_backup(uuid)']) fn
   where has_function_privilege(role, fn, 'EXECUTE')),
  0, 'anon et authenticated n''appellent ni la recherche par adresse ni l''effacement');
select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) acl
    where p.oid in ('public.account_id_by_email(text)'::regprocedure,
                    'public.delete_cloud_backup(uuid)'::regprocedure)
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'),
  'aucun droit d''exécution pour public');

set local role service_role;

select throws_ok($$ select count(*) from public.treatment_dose $$,
  '42501', null, 'comme en production, service_role ne lit pas les doses');

select is(public.account_id_by_email('sophie@exemple.test'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'le compte se retrouve par son adresse');
select is(public.account_id_by_email('  Sophie@Exemple.TEST '),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'l''adresse se compare sans casse ni espaces autour');
select is(public.account_id_by_email('inconnue@exemple.test'), null, 'une adresse inconnue ne désigne aucun compte');

reset role;
select is(
  (select array_agg(n order by name) from pg_temp.rows_of('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  array[1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'avant : une ligne par table de la sauvegarde de Sophie');

set local role service_role;
select lives_ok($$ select public.delete_cloud_backup(null) $$, 'sans compte, l''effacement ne refuse pas');
select lives_ok($$ select public.delete_cloud_backup('ffffffff-ffff-4fff-8fff-ffffffffffff') $$,
  'un compte inconnu ne refuse pas non plus');
reset role;
select is(
  (select array_agg(n order by name) from pg_temp.rows_of('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    || (select array_agg(n order by name) from pg_temp.rows_of('dddddddd-dddd-4ddd-8ddd-dddddddddddd')),
  array[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  'sans compte ou avec un compte inconnu, aucune sauvegarde n''est touchée');

create function public.keep_sync_push_row() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger keep_sync_push_row before delete on public.sync_push
  for each row execute function public.keep_sync_push_row();
set local role service_role;
select throws_ok($$ select public.delete_cloud_backup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'P0001', null, 'une ligne restée fait échouer l''effacement au lieu d''un faux succès');
reset role;
drop trigger keep_sync_push_row on public.sync_push;
select is(
  (select array_agg(n order by name) from pg_temp.rows_of('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  array[1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'après un échec, rien n''est à moitié effacé');

create role backup_owner_without_bypass nologin;
grant backup_owner_without_bypass to postgres;
grant create on schema public to backup_owner_without_bypass;
do $$
declare
  t text;
begin
  for t in select name from backup loop
    execute format('grant select, delete on table public.%I to backup_owner_without_bypass', t);
  end loop;
end
$$;
alter function public.delete_cloud_backup(uuid) owner to backup_owner_without_bypass;
set local role service_role;
select throws_ok($$ select public.delete_cloud_backup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  '42501', null, 'un propriétaire soumis aux règles d''accès fait échouer l''effacement au lieu de ne rien effacer');
reset role;
alter function public.delete_cloud_backup(uuid) owner to postgres;
select is(
  (select array_agg(n order by name) from pg_temp.rows_of('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  array[1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'la sauvegarde de Sophie est encore entière');

set local role service_role;
select lives_ok($$ select public.delete_cloud_backup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'service_role efface la sauvegarde de Sophie');
select lives_ok($$ select public.delete_cloud_backup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $$,
  'effacer une sauvegarde déjà vide ne gêne pas');

reset role;
select is(
  (select count(*)::int from backup b, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege('service_role', 'public.' || b.name, p)),
  0, 'service_role n''a toujours ni lecture ni écriture sur la sauvegarde');
select is(
  (select array_agg(n order by name) from pg_temp.rows_of('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  array[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'la sauvegarde de Sophie est vide');
select is(
  (select array_agg(n order by name) from pg_temp.rows_of('dddddddd-dddd-4ddd-8ddd-dddddddddddd')),
  array[1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'celle de Paul est intacte');
select is(
  (select count(*)::int from public.plus_entitlements where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1, 'le droit Plus de Sophie reste');
select is(
  (select count(*)::int from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1, 'le compte de Sophie reste');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select throws_ok($$ select public.account_id_by_email('paul@exemple.test') $$,
  '42501', null, 'authenticated ne cherche pas un compte par son adresse');
select throws_ok($$ select public.delete_cloud_backup('dddddddd-dddd-4ddd-8ddd-dddddddddddd') $$,
  '42501', null, 'authenticated n''efface pas une sauvegarde');

reset role;
set local role anon;
select throws_ok($$ select public.account_id_by_email('paul@exemple.test') $$,
  '42501', null, 'anon ne cherche pas un compte par son adresse');
select throws_ok($$ select public.delete_cloud_backup('dddddddd-dddd-4ddd-8ddd-dddddddddddd') $$,
  '42501', null, 'anon n''efface pas une sauvegarde');

reset role;
select * from finish();
rollback;
