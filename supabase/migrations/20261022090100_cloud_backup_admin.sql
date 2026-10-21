-- Mode admin de delete-account : retrouver un compte par son adresse, effacer sa seule sauvegarde.
create function public.account_id_by_email(account_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users
  where email = lower(trim(account_email)) and not is_sso_user
$$;

revoke execute on function public.account_id_by_email(text) from public, anon, authenticated;
grant execute on function public.account_id_by_email(text) to service_role;

-- Le compte et son droit Plus restent ; toute table d'un compte qui n'est pas le droit Plus part.
create function public.delete_cloud_backup(account uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.treatment_dose where user_id = account;
  delete from public.treatment_period where user_id = account;
  delete from public.treatment where user_id = account;
  delete from public.vaccination_injection where user_id = account;
  delete from public.vaccination where user_id = account;
  delete from public.weight_entry where user_id = account;
  delete from public.animal where user_id = account;
  delete from public.carnet_settings where user_id = account;
  delete from public.device where user_id = account;
  delete from public.sync_push where user_id = account;
end;
$$;

revoke execute on function public.delete_cloud_backup(uuid) from public, anon, authenticated;
grant execute on function public.delete_cloud_backup(uuid) to service_role;
