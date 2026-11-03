-- service_role n'a, en production, aucun droit de lecture ni d'effacement sur les miroirs : la fonction efface pour lui.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    raise exception 'delete_cloud_backup : son propriétaire doit passer outre les règles d''accès';
  end if;
end
$$;

create or replace function public.delete_cloud_backup(account uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
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

  if exists (select 1 from public.treatment_dose where user_id = account)
    or exists (select 1 from public.treatment_period where user_id = account)
    or exists (select 1 from public.treatment where user_id = account)
    or exists (select 1 from public.vaccination_injection where user_id = account)
    or exists (select 1 from public.vaccination where user_id = account)
    or exists (select 1 from public.weight_entry where user_id = account)
    or exists (select 1 from public.animal where user_id = account)
    or exists (select 1 from public.carnet_settings where user_id = account)
    or exists (select 1 from public.device where user_id = account)
    or exists (select 1 from public.sync_push where user_id = account)
  then
    raise exception 'delete_cloud_backup : la sauvegarde n''a pas été entièrement effacée';
  end if;
end;
$$;

revoke execute on function public.delete_cloud_backup(uuid) from public, anon, authenticated;
grant execute on function public.delete_cloud_backup(uuid) to service_role;
