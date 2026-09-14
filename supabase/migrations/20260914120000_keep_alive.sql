-- Keep-alive du projet Supabase Free (#187).
-- Le ping de /auth/v1/settings n'exécute aucune requête Postgres et n'a pas
-- empêché la pause automatique : le workflow appelle cette fonction via PostgREST.
-- Elle ne lit aucune donnée.
create or replace function public.keep_alive()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select 1;
$$;

revoke execute on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;
