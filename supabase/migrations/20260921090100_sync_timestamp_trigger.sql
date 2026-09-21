-- Écrête un updated_at à plus de 24h dans le futur : sinon une horloge déréglée gagnerait pour toujours.
create or replace function public.clamp_sync_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.updated_at > now() + interval '24 hours' then
    new.updated_at := now();
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

create trigger animal_clamp_sync_timestamps
  before insert or update on public.animal
  for each row
  execute function public.clamp_sync_timestamps();

create trigger vaccination_clamp_sync_timestamps
  before insert or update on public.vaccination
  for each row
  execute function public.clamp_sync_timestamps();

create trigger treatment_clamp_sync_timestamps
  before insert or update on public.treatment
  for each row
  execute function public.clamp_sync_timestamps();

create trigger weight_entry_clamp_sync_timestamps
  before insert or update on public.weight_entry
  for each row
  execute function public.clamp_sync_timestamps();
