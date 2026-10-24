begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Un compte par cas ; les dates sont forgées, l'instant « maintenant » est passé à la fonction.
insert into auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'jamais-achete@exemple.test', '2026-01-10T08:00:00Z', '2026-01-10T08:05:00Z', '{"locale": "fr"}');
insert into auth.users (id, email, created_at, email_confirmed_at) values
  ('a0000000-0000-4000-8000-000000000002', 'plus-fini@exemple.test', '2025-06-01T08:00:00Z', '2025-06-01T08:05:00Z'),
  ('a0000000-0000-4000-8000-000000000003', 'abonnement-en-cours@exemple.test', '2024-01-01T08:00:00Z', '2024-01-01T08:05:00Z'),
  ('a0000000-0000-4000-8000-000000000004', 'a-vie@exemple.test', '2024-01-01T08:00:00Z', '2024-01-01T08:05:00Z'),
  ('a0000000-0000-4000-8000-000000000005', 'fin-31-mars@exemple.test', '2025-01-01T08:00:00Z', '2025-01-01T08:05:00Z'),
  ('a0000000-0000-4000-8000-000000000006', 'fin-29-fevrier@exemple.test', '2025-01-01T08:00:00Z', '2025-01-01T08:05:00Z'),
  ('a0000000-0000-4000-8000-000000000007', 'jamais-confirme@exemple.test', '2026-11-02T10:00:00Z', null),
  ('a0000000-0000-4000-8000-000000000008', 'averti@exemple.test', '2025-01-01T08:00:00Z', '2025-01-01T08:05:00Z'),
  ('a0000000-0000-4000-8000-000000000009', 'reprise@exemple.test', '2025-01-01T08:00:00Z', '2025-01-01T08:05:00Z'),
  ('a0000000-0000-4000-8000-00000000000a', 'refini@exemple.test', '2025-01-01T08:00:00Z', '2025-01-01T08:05:00Z'),
  ('a0000000-0000-4000-8000-00000000000b', 'fin-31-janvier@exemple.test', '2025-01-01T08:00:00Z', '2025-01-01T08:05:00Z');

insert into public.plus_entitlements (user_id, active, product_type, expires_at) values
  ('a0000000-0000-4000-8000-000000000002', false, 'annual', '2026-11-15T14:00:00Z'),
  ('a0000000-0000-4000-8000-000000000003', false, 'monthly', '2027-12-01T00:00:00Z'),
  ('a0000000-0000-4000-8000-000000000004', true, 'lifetime', null),
  ('a0000000-0000-4000-8000-000000000005', false, 'annual', '2026-03-31T10:00:00Z'),
  ('a0000000-0000-4000-8000-000000000006', false, 'annual', '2028-02-29T10:00:00Z'),
  ('a0000000-0000-4000-8000-000000000008', false, 'annual', '2026-01-15T10:00:00Z'),
  ('a0000000-0000-4000-8000-000000000009', true, 'annual', '2028-01-15T10:00:00Z'),
  ('a0000000-0000-4000-8000-00000000000a', false, 'annual', '2027-03-01T10:00:00Z'),
  ('a0000000-0000-4000-8000-00000000000b', false, 'monthly', '2027-01-31T10:00:00Z');

-- Averti le 1er décembre 2026 pour une fin d'accès au 15 janvier 2026 ; la reprise avait été avertie
-- avant de reprendre Plus ; « refini » avait été averti pour une fin d'accès d'avant sa reprise.
insert into public.account_purge_notice (user_id, inactive_since, purge_on, warned_at, revenuecat_erased_at) values
  ('a0000000-0000-4000-8000-000000000008', '2026-01-15T10:00:00Z', '2027-01-16', '2026-12-01T03:00:00Z', '2026-03-16T03:00:00Z'),
  ('a0000000-0000-4000-8000-000000000009', '2026-01-15T10:00:00Z', '2027-01-16', '2026-12-01T03:00:00Z', '2026-03-16T03:00:00Z'),
  ('a0000000-0000-4000-8000-00000000000a', '2026-01-15T10:00:00Z', '2027-01-16', '2026-12-01T03:00:00Z', '2026-03-16T03:00:00Z');

create function pg_temp.step_of(account uuid, at timestamptz) returns text language sql as $$
  select coalesce(
    (select coalesce(step, '-') || case when revenuecat_erasure_due then '+revenuecat' else '' end
     from public.inactive_account_steps(at, account)),
    'absent')
$$;

select has_table('public', 'account_purge_notice', 'la table des avis de purge existe');
select columns_are('public', 'account_purge_notice',
  array['user_id', 'inactive_since', 'purge_on', 'warned_at', 'revenuecat_erased_at'],
  'l''avis garde le compte, la fin d''accès retenue, la date J, l''avertissement et l''effacement RevenueCat');
select fk_ok('public', 'account_purge_notice', 'user_id', 'auth', 'users', 'id',
  'l''avis référence auth.users');

-- Jamais acheté : 12 mois après la création, averti à 11 mois.
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000001', '2026-12-10T07:59:59Z'), 'absent',
  'jamais acheté : rien avant 11 mois');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000001', '2026-12-10T08:00:00Z'), 'warn',
  'jamais acheté : avertissement à 11 mois après la création, sans effacement RevenueCat');

-- Plus fini le 15 novembre 2026 à 14 h.
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000002', '2027-01-14T13:59:59Z'), 'absent',
  'Plus fini : rien avant 60 jours');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000002', '2027-01-14T14:00:00Z'), '-+revenuecat',
  'Plus fini : client RevenueCat à effacer 60 jours après la fin');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000002', '2027-10-15T13:59:59Z'), '-+revenuecat',
  'Plus fini : pas d''avertissement avant 11 mois');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000002', '2027-10-15T14:00:00Z'), 'warn+revenuecat',
  'Plus fini : avertissement 11 mois après la fin');

select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000003', '2027-11-30T23:59:59Z'), 'absent',
  'abonnement en cours (période de grâce comprise) : jamais candidat');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000004', '2040-01-01T00:00:00Z'), 'absent',
  'achat à vie : jamais candidat');

-- Mois courts : fin le 31 mars, le 29 février et le 31 janvier.
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000005', '2027-02-28T09:59:59Z'), '-+revenuecat',
  'fin le 31 mars 2026 : pas d''avertissement avant le 28 février 2027 à 10 h');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000005', '2027-02-28T10:00:00Z'), 'warn+revenuecat',
  'fin le 31 mars 2026 : avertissement le 28 février 2027');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000006', '2029-01-29T09:59:59Z'), '-+revenuecat',
  'fin le 29 février 2028 : pas d''avertissement avant le 29 janvier 2029 à 10 h');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000006', '2029-01-29T10:00:00Z'), 'warn+revenuecat',
  'fin le 29 février 2028 : avertissement le 29 janvier 2029');
select is(pg_temp.step_of('a0000000-0000-4000-8000-00000000000b', '2027-03-31T09:59:59Z'), 'absent',
  'fin le 31 janvier 2027 : rien avant 60 jours, le 1er avril');
select is(pg_temp.step_of('a0000000-0000-4000-8000-00000000000b', '2027-12-31T10:00:00Z'), 'warn+revenuecat',
  'fin le 31 janvier 2027 : avertissement le 31 décembre 2027');

-- Adresse jamais confirmée : 7 jours, sans e-mail.
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000007', '2026-11-09T09:59:59Z'), 'absent',
  'adresse jamais confirmée : rien avant 7 jours');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000007', '2026-11-09T10:00:00Z'), 'delete-unconfirmed',
  'adresse jamais confirmée : supprimée à 7 jours');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000007', '2027-10-09T10:00:00Z'), 'delete-unconfirmed',
  'adresse jamais confirmée : jamais avertie');

-- Averti : supprimé le jour J retenu, pas avant.
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000008', '2027-01-15T23:59:59Z'), 'absent',
  'averti : rien avant le jour J');
select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000008', '2027-01-16T00:00:00Z'), 'delete',
  'averti : supprimé le jour J');

select is(pg_temp.step_of('a0000000-0000-4000-8000-000000000009', '2027-06-01T00:00:00Z'), 'absent',
  'reprise de Plus après l''avertissement : plus candidat');
select is(pg_temp.step_of('a0000000-0000-4000-8000-00000000000a', '2027-05-01T10:00:00Z'), '-+revenuecat',
  'Plus repris puis fini de nouveau : l''ancien avis ne compte plus');

select is(
  (select count(*)::int from public.inactive_account_steps('2027-01-16T00:00:00Z')
   where user_id in ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004')),
  0, 'sans compte désigné, la liste écarte l''abonnement en cours et l''achat à vie');
select is(
  (select step from public.inactive_account_steps('2027-01-16T00:00:00Z')
   where user_id = 'a0000000-0000-4000-8000-000000000008'),
  'delete', 'sans compte désigné, la liste rend chaque candidat avec son étape');
select is(
  (select email || ' ' || locale from public.inactive_account_steps('2026-12-10T08:00:00Z', 'a0000000-0000-4000-8000-000000000001')),
  'jamais-achete@exemple.test fr', 'l''adresse et la langue de l''inscription sont rendues pour l''avertissement');

-- Droits.
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
   where oid = 'public.account_purge_notice'::regclass),
  'RLS activée et forcée');
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'account_purge_notice'),
  0, 'aucune policy : personne ne passe par la RLS');
select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) role,
        unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege
   where has_table_privilege(role, 'public.account_purge_notice', privilege)
      or has_any_column_privilege(role, 'public.account_purge_notice', 'SELECT, INSERT, UPDATE')),
  0, 'anon et authenticated n''ont aucun droit sur les avis');
select is(
  (select array_agg(privilege order by privilege)
   from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege
   where has_table_privilege('service_role', 'public.account_purge_notice', privilege)),
  array['INSERT', 'SELECT', 'UPDATE'], 'service_role lit, crée et met à jour un avis');
select ok(
  not has_function_privilege('anon', 'public.inactive_account_steps(timestamptz, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.inactive_account_steps(timestamptz, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.inactive_account_steps(timestamptz, uuid)', 'execute'),
  'seul service_role liste les comptes inactifs');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select throws_ok($$ select * from public.inactive_account_steps(now()) $$,
  '42501', null, 'authenticated ne liste pas les comptes inactifs');
select throws_ok($$ select 1 from public.account_purge_notice $$,
  '42501', null, 'authenticated ne lit pas les avis');
reset role;
set local role anon;
select throws_ok($$ select * from public.inactive_account_steps(now()) $$,
  '42501', null, 'anon ne liste pas les comptes inactifs');
select throws_ok($$ insert into public.account_purge_notice (user_id, inactive_since)
  values ('a0000000-0000-4000-8000-000000000001', now()) $$,
  '42501', null, 'anon n''écrit pas d''avis');
reset role;

set local role service_role;
select lives_ok($$ insert into public.account_deletion_log (origin) values ('inactivity') $$,
  'une suppression pour inactivité se journalise');
select lives_ok($$ insert into public.account_purge_notice (user_id, inactive_since)
  values ('a0000000-0000-4000-8000-000000000001', '2026-01-10T08:00:00Z') $$,
  'service_role crée un avis');
select throws_ok($$ insert into public.account_purge_notice (user_id, inactive_since, warned_at)
  values ('a0000000-0000-4000-8000-000000000002', now(), now()) $$,
  '23514', null, 'un avertissement sans date J est refusé');
reset role;

delete from auth.users where id = 'a0000000-0000-4000-8000-000000000008';
select is(
  (select count(*)::int from public.account_purge_notice
   where user_id = 'a0000000-0000-4000-8000-000000000008'),
  0, 'l''avis part avec le compte');

select * from finish();
rollback;
