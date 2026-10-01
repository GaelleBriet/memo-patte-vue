-- Contrôle et suppression dans une seule instruction : si un miroir contient une ligne, rien n'est supprimé.
do $$
declare
  mirror text;
  filled text[] := '{}';
  has_row boolean;
begin
  foreach mirror in array array[
    'animal', 'vaccination', 'vaccination_injection', 'treatment', 'treatment_dose', 'weight_entry'
  ] loop
    execute format('lock table public.%I in access exclusive mode', mirror);
    execute format('select exists (select 1 from public.%I)', mirror) into has_row;
    if has_row then
      filled := filled || mirror;
    end if;
  end loop;

  if cardinality(filled) > 0 then
    raise exception 'Miroirs non vides, rien n''est supprimé : %', array_to_string(filled, ', ');
  end if;

  drop table public.treatment_dose, public.vaccination_injection, public.treatment,
    public.vaccination, public.weight_entry, public.animal;
end;
$$;

create table public.animal (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  name text not null check (char_length(name) <= 80),
  species text not null check (species in ('dog', 'cat')),
  breed text check (char_length(breed) <= 80),
  birth_date date,
  birth_date_approximate smallint not null default 0 check (birth_date_approximate in (0, 1)),
  photo_path text,
  unfollowed_on date,
  departure_reason text check (departure_reason in ('death', 'rehomed', 'other')),
  departure_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index on public.animal (user_id, server_updated_at);

create trigger animal_clamp_sync_timestamps
  before insert or update on public.animal
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.animal enable row level security;
alter table public.animal force row level security;

create policy animal_select on public.animal for select to authenticated
  using (user_id = (select auth.uid()));

create policy animal_insert on public.animal for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy animal_update on public.animal for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.animal from anon, authenticated;
grant select, insert on table public.animal to authenticated;
grant update (
  name, species, breed, birth_date, birth_date_approximate, photo_path, unfollowed_on,
  departure_reason, departure_date, created_at, updated_at, deleted_at
) on table public.animal to authenticated;

create table public.weight_entry (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  animal_id uuid not null,
  weight_kg double precision not null,
  measured_on date not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.weight_entry (user_id, server_updated_at);
create index on public.weight_entry (user_id, animal_id);

create trigger weight_entry_clamp_sync_timestamps
  before insert or update on public.weight_entry
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.weight_entry enable row level security;
alter table public.weight_entry force row level security;

create policy weight_entry_select on public.weight_entry for select to authenticated
  using (user_id = (select auth.uid()));

create policy weight_entry_insert on public.weight_entry for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy weight_entry_update on public.weight_entry for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.weight_entry from anon, authenticated;
grant select, insert on table public.weight_entry to authenticated;
grant update (
  animal_id, weight_kg, measured_on, created_at, updated_at, deleted_at
) on table public.weight_entry to authenticated;

create table public.carnet_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null check (id = '00000000-0000-0000-0000-000000000000'),
  vaccine_reminder_time text not null default '09:00'
    check (vaccine_reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  remind_before_due smallint not null default 1 check (remind_before_due in (0, 1)),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index on public.carnet_settings (user_id, server_updated_at);

create trigger carnet_settings_clamp_sync_timestamps
  before insert or update on public.carnet_settings
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.carnet_settings enable row level security;
alter table public.carnet_settings force row level security;

create policy carnet_settings_select on public.carnet_settings for select to authenticated
  using (user_id = (select auth.uid()));

create policy carnet_settings_insert on public.carnet_settings for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy carnet_settings_update on public.carnet_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.carnet_settings from anon, authenticated;
grant select, insert on table public.carnet_settings to authenticated;
grant update (
  vaccine_reminder_time, remind_before_due, created_at, updated_at, deleted_at
) on table public.carnet_settings to authenticated;

create table public.vaccination (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  animal_id uuid not null,
  name text not null check (char_length(name) <= 80),
  planned_due_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.vaccination (user_id, server_updated_at);
create index on public.vaccination (user_id, animal_id);

create trigger vaccination_clamp_sync_timestamps
  before insert or update on public.vaccination
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.vaccination enable row level security;
alter table public.vaccination force row level security;

create policy vaccination_select on public.vaccination for select to authenticated
  using (user_id = (select auth.uid()));

create policy vaccination_insert on public.vaccination for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy vaccination_update on public.vaccination for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.vaccination from anon, authenticated;
grant select, insert on table public.vaccination to authenticated;
grant update (
  animal_id, name, planned_due_date, created_at, updated_at, deleted_at
) on table public.vaccination to authenticated;

create table public.vaccination_injection (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  vaccination_id uuid not null,
  animal_id uuid not null,
  injected_on date not null,
  next_due_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, vaccination_id) references public.vaccination (user_id, id) on delete cascade,
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.vaccination_injection (user_id, server_updated_at);
create index on public.vaccination_injection (user_id, vaccination_id);
create index on public.vaccination_injection (user_id, animal_id);

create trigger vaccination_injection_clamp_sync_timestamps
  before insert or update on public.vaccination_injection
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.vaccination_injection enable row level security;
alter table public.vaccination_injection force row level security;

create policy vaccination_injection_select on public.vaccination_injection for select to authenticated
  using (user_id = (select auth.uid()));

create policy vaccination_injection_insert on public.vaccination_injection for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy vaccination_injection_update on public.vaccination_injection for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.vaccination_injection from anon, authenticated;
grant select, insert on table public.vaccination_injection to authenticated;
grant update (
  vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at, deleted_at
) on table public.vaccination_injection to authenticated;

create table public.treatment (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  animal_id uuid not null,
  name text not null check (char_length(name) <= 80),
  type text not null check (type in ('deworming', 'antiparasitic', 'medication')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.treatment (user_id, server_updated_at);
create index on public.treatment (user_id, animal_id);

create trigger treatment_clamp_sync_timestamps
  before insert or update on public.treatment
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.treatment enable row level security;
alter table public.treatment force row level security;

create policy treatment_select on public.treatment for select to authenticated
  using (user_id = (select auth.uid()));

create policy treatment_insert on public.treatment for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy treatment_update on public.treatment for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.treatment from anon, authenticated;
grant select, insert on table public.treatment to authenticated;
grant update (
  animal_id, name, type, created_at, updated_at, deleted_at
) on table public.treatment to authenticated;

create table public.treatment_period (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  treatment_id uuid not null,
  animal_id uuid not null,
  starts_on date not null,
  first_due_on date not null,
  ends_on date,
  stopped_on date,
  frequency_value integer not null check (frequency_value > 0),
  frequency_unit text not null check (frequency_unit in ('day', 'week', 'month')),
  times text,
  dose_quantity double precision,
  dose_unit text check (dose_unit in (
    'tablet', 'capsule', 'pipette', 'collar', 'ml', 'drop', 'g', 'sachet', 'spray', 'application', 'dose'
  )),
  reminder_offset_minutes integer check (reminder_offset_minutes in (0, 15, 30, 60)),
  reminder_time text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, treatment_id) references public.treatment (user_id, id) on delete cascade,
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.treatment_period (user_id, server_updated_at);
create index on public.treatment_period (user_id, treatment_id);
create index on public.treatment_period (user_id, animal_id);

create trigger treatment_period_clamp_sync_timestamps
  before insert or update on public.treatment_period
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.treatment_period enable row level security;
alter table public.treatment_period force row level security;

create policy treatment_period_select on public.treatment_period for select to authenticated
  using (user_id = (select auth.uid()));

create policy treatment_period_insert on public.treatment_period for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy treatment_period_update on public.treatment_period for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.treatment_period from anon, authenticated;
grant select, insert on table public.treatment_period to authenticated;
grant update (
  treatment_id, animal_id, starts_on, first_due_on, ends_on, stopped_on, frequency_value,
  frequency_unit, times, dose_quantity, dose_unit, reminder_offset_minutes, reminder_time,
  created_at, updated_at, deleted_at
) on table public.treatment_period to authenticated;

create table public.treatment_dose (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  period_id uuid not null,
  treatment_id uuid not null,
  animal_id uuid not null,
  due_on date not null,
  due_time text,
  given_on date,
  status text not null check (status in ('given', 'missed', 'postponed')),
  next_due_date date not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, period_id) references public.treatment_period (user_id, id) on delete cascade,
  foreign key (user_id, treatment_id) references public.treatment (user_id, id) on delete cascade,
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.treatment_dose (user_id, server_updated_at);
create index on public.treatment_dose (user_id, period_id);
create index on public.treatment_dose (user_id, treatment_id);
create index on public.treatment_dose (user_id, animal_id);

create trigger treatment_dose_clamp_sync_timestamps
  before insert or update on public.treatment_dose
  for each row
  execute function public.clamp_sync_timestamps();

alter table public.treatment_dose enable row level security;
alter table public.treatment_dose force row level security;

create policy treatment_dose_select on public.treatment_dose for select to authenticated
  using (user_id = (select auth.uid()));

create policy treatment_dose_insert on public.treatment_dose for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

create policy treatment_dose_update on public.treatment_dose for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.has_active_plus()));

revoke all on table public.treatment_dose from anon, authenticated;
grant select, insert on table public.treatment_dose to authenticated;
grant update (
  period_id, treatment_id, animal_id, due_on, due_time, given_on, status, next_due_date,
  created_at, updated_at, deleted_at
) on table public.treatment_dose to authenticated;

revoke execute on function public.has_active_plus() from anon;
revoke execute on function public.clamp_sync_timestamps() from public, anon, authenticated;
