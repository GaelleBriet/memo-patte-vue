-- service_role n'a, en production, aucun droit de lecture ni d'effacement sur les miroirs : la fonction efface pour lui.
create or replace function public.delete_cloud_backup(account uuid)
returns void
language plpgsql
security definer
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
