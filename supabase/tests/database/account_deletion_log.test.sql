begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'account_deletion_log', 'le journal des suppressions existe');

select columns_are('public', 'account_deletion_log', array['deleted_on', 'origin'],
  'le journal ne garde que la date et l''origine, aucune donnée personnelle');
select col_type_is('public', 'account_deletion_log', 'deleted_on', 'date',
  'la date, sans l''heure qui la rapprocherait des journaux de connexion');
select col_not_null('public', 'account_deletion_log', 'deleted_on', 'date obligatoire');
select col_not_null('public', 'account_deletion_log', 'origin', 'origine obligatoire');

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
   where oid = 'public.account_deletion_log'::regclass),
  'RLS activée et forcée');
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'account_deletion_log'),
  0, 'aucune policy : personne ne passe par la RLS');

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated']) role,
        unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege
   where has_table_privilege(role, 'public.account_deletion_log', privilege)
      or has_any_column_privilege(role, 'public.account_deletion_log', 'SELECT, INSERT, UPDATE')),
  0, 'anon et authenticated n''ont aucun droit sur le journal');

select is(
  (select array_agg(privilege order by privilege)
   from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege
   where has_table_privilege('service_role', 'public.account_deletion_log', privilege)),
  array['INSERT', 'SELECT'],
  'service_role ajoute et lit, sans jamais modifier ni effacer une ligne');

create temp table logged_before as
  select origin, count(*)::int as n from public.account_deletion_log
  where deleted_on = current_date group by origin;
grant select on logged_before to service_role;

set local role service_role;

select lives_ok($$ insert into public.account_deletion_log (origin) values ('app') $$,
  'la fonction note une suppression depuis l''app');
select lives_ok($$ insert into public.account_deletion_log (origin) values ('email') $$,
  'la fonction note une suppression demandée par e-mail');
select results_eq(
  $$ select origin, count(*)::int from public.account_deletion_log
     where deleted_on = current_date group by origin order by origin $$,
  $$ select o, coalesce(b.n, 0) + 1 from (values ('app'), ('email')) v (o)
     left join logged_before b on b.origin = v.o order by o $$,
  'une ligne de plus par origine, datée du jour par la base');
select throws_ok($$ insert into public.account_deletion_log (origin) values ('script') $$,
  '23514', null, 'une autre origine est refusée');
select throws_ok($$ insert into public.account_deletion_log (origin) values (null) $$,
  '23502', null, 'une origine absente est refusée');
select throws_ok($$ update public.account_deletion_log set origin = 'app' $$,
  '42501', null, 'service_role ne réécrit pas le journal');
select throws_ok($$ delete from public.account_deletion_log $$,
  '42501', null, 'service_role n''efface pas le journal');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
select throws_ok($$ select 1 from public.account_deletion_log $$,
  '42501', null, 'authenticated ne lit pas le journal');
select throws_ok($$ insert into public.account_deletion_log (origin) values ('app') $$,
  '42501', null, 'authenticated n''écrit pas dans le journal');

reset role;
set local role anon;
select throws_ok($$ select 1 from public.account_deletion_log $$,
  '42501', null, 'anon ne lit pas le journal');
select throws_ok($$ insert into public.account_deletion_log (origin) values ('app') $$,
  '42501', null, 'anon n''écrit pas dans le journal');

reset role;
select * from finish();
rollback;
