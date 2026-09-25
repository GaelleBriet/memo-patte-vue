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

create table public.treatment_dose (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  treatment_id uuid not null,
  animal_id uuid not null,
  given_on date not null,
  next_due_date date not null,
  frequency_value integer not null check (frequency_value > 0),
  frequency_unit text not null check (frequency_unit in ('day', 'week', 'month')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, treatment_id) references public.treatment (user_id, id) on delete cascade,
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.treatment_dose (user_id, server_updated_at);

alter table public.vaccination_injection enable row level security;

create policy vaccination_injection_select on public.vaccination_injection for select
  using (user_id = (select auth.uid()));

create policy vaccination_injection_insert on public.vaccination_injection for insert
  with check (user_id = (select auth.uid()) and public.has_active_plus());

create policy vaccination_injection_update on public.vaccination_injection for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_active_plus());

alter table public.treatment_dose enable row level security;

create policy treatment_dose_select on public.treatment_dose for select
  using (user_id = (select auth.uid()));

create policy treatment_dose_insert on public.treatment_dose for insert
  with check (user_id = (select auth.uid()) and public.has_active_plus());

create policy treatment_dose_update on public.treatment_dose for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_active_plus());

create trigger vaccination_injection_clamp_sync_timestamps
  before insert or update on public.vaccination_injection
  for each row
  execute function public.clamp_sync_timestamps();

create trigger treatment_dose_clamp_sync_timestamps
  before insert or update on public.treatment_dose
  for each row
  execute function public.clamp_sync_timestamps();

-- Comme la migration v6 de l'app : chaque ligne déjà poussée garde ses dates dans un premier événement de même identifiant.
insert into public.vaccination_injection
  (user_id, id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at, deleted_at)
select user_id, id, id, animal_id, last_injection_date, due_date, created_at, updated_at, deleted_at
from public.vaccination;

insert into public.treatment_dose
  (user_id, id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit,
   created_at, updated_at, deleted_at)
select user_id, id, id, animal_id, last_dose_date, next_due_date, frequency_value, frequency_unit,
       created_at, updated_at, deleted_at
from public.treatment;

alter table public.vaccination
  drop column last_injection_date,
  drop column due_date;

alter table public.treatment
  drop column last_dose_date,
  drop column next_due_date,
  add column stopped_on date;
