-- Miroirs du schéma v11 : colonnes d'appareil, jour de référence, prise en plus et ligne de décalage.
-- Les colonnes obligatoires s'ajoutent sans valeur par défaut : la migration exige des miroirs vides.
do $$
declare
  mirror text;
  filled text[] := '{}';
  has_row boolean;
begin
  foreach mirror in array array[
    'animal', 'weight_entry', 'carnet_settings', 'vaccination', 'vaccination_injection',
    'treatment', 'treatment_period', 'treatment_dose'
  ] loop
    execute format('lock table public.%I in access exclusive mode', mirror);
    execute format('select exists (select 1 from public.%I)', mirror) into has_row;
    if has_row then
      filled := filled || mirror;
    end if;
  end loop;

  if cardinality(filled) > 0 then
    raise exception 'Miroirs non vides, rien n''est modifié : %', array_to_string(filled, ', ');
  end if;

  foreach mirror in array array[
    'animal', 'weight_entry', 'carnet_settings', 'vaccination', 'vaccination_injection',
    'treatment', 'treatment_period', 'treatment_dose'
  ] loop
    execute format(
      'alter table public.%I add column created_by_device uuid not null, '
      'add column updated_by_device uuid not null',
      mirror);
    execute format(
      'grant update (created_by_device, updated_by_device) on table public.%I to authenticated',
      mirror);
  end loop;
end;
$$;

alter table public.treatment_period add column reference_on date not null;
grant update (reference_on) on table public.treatment_period to authenticated;

alter table public.treatment_dose drop constraint treatment_dose_status_check;
alter table public.treatment_dose add constraint treatment_dose_status_check
  check (status in ('given', 'missed', 'postponed', 'extra', 'shift'));

create table public.device (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  model text check (char_length(model) <= 200),
  installed_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index on public.device (user_id, server_updated_at);

create trigger device_clamp_sync_timestamps
  before insert or update on public.device
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.device enable row level security;
alter table public.device force row level security;

create policy device_select on public.device for select to authenticated
  using (user_id = (select auth.uid()));

create policy device_insert on public.device for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy device_update on public.device for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.device from anon, authenticated;
grant select, insert on table public.device to authenticated;
grant update (
  model, installed_at, created_at, updated_at, deleted_at
) on table public.device to authenticated;
