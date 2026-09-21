create or replace function public.has_active_plus()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plus_entitlements
    where user_id = (select auth.uid())
      and active
      and (expires_at is null or expires_at > now())
  );
$$;

revoke execute on function public.has_active_plus() from public;
grant execute on function public.has_active_plus() to authenticated;
