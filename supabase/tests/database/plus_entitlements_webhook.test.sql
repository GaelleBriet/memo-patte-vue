begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Sophie a Plus annuel ; Marc l'a eu jusqu'au 3 mars.
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

create function pg_temp.has_plus(account uuid) returns boolean language plpgsql as $$
declare
  result boolean;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', account, 'role', 'authenticated')::text, true);
  result := public.has_active_plus();
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  return result;
end;
$$;

set local role service_role;

select is(
  (select array_agg(privilege order by privilege)
   from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) privilege
   where has_table_privilege('service_role', 'public.plus_entitlements', privilege)),
  array['INSERT', 'SELECT', 'UPDATE'],
  'le webhook lit, crée et met à jour les droits Plus, sans jamais en effacer');

select lives_ok($$
  insert into public.plus_entitlements (user_id, active, product_type, expires_at, updated_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, 'annual', now() + interval '1 year', now()),
         ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false, 'monthly', now() - interval '7 days', now())
  on conflict (user_id) do update set active = excluded.active
$$, 'le webhook crée la ligne d''un compte');
select ok(pg_temp.has_plus('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Sophie a Plus');
select ok(not pg_temp.has_plus('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'Marc ne l''a plus');

select lives_ok($$
  insert into public.plus_entitlements (user_id, active, product_type, expires_at, updated_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, 'annual', now() + interval '16 days', now())
  on conflict (user_id) do update set
    active = excluded.active, product_type = excluded.product_type,
    expires_at = excluded.expires_at, updated_at = excluded.updated_at
$$, 'le webhook remplace la ligne relue chez RevenueCat');
select is((select count(*)::int from public.plus_entitlements), 2, 'une seule ligne par compte');
select ok(pg_temp.has_plus('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'pendant le délai de paiement, Sophie garde Plus');

-- Fin de l'accès : seule une ligne encore ouverte prend la date du jour.
update public.plus_entitlements set active = false, expires_at = now()
where (expires_at is null or expires_at > now());
select ok(not pg_temp.has_plus('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Sophie n''a plus Plus');
select ok(
  (select expires_at < now() - interval '6 days' from public.plus_entitlements
   where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'la fin déjà passée de Marc est gardée pour la purge');

reset role;
select * from finish();
rollback;
