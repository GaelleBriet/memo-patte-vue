create table public.animal (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  name text not null,
  species text not null check (species in ('dog', 'cat')),
  breed text,
  birth_date date,
  initial_weight_kg double precision,
  photo_path text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index on public.animal (user_id, server_updated_at);

create table public.vaccination (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  animal_id uuid not null,
  name text not null,
  last_injection_date date not null,
  due_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.vaccination (user_id, server_updated_at);

create table public.treatment (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  animal_id uuid not null,
  name text not null,
  type text not null check (type in ('deworming', 'antiparasitic')),
  frequency_value integer not null check (frequency_value > 0),
  frequency_unit text not null check (frequency_unit in ('day', 'week', 'month')),
  last_dose_date date not null,
  next_due_date date not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.treatment (user_id, server_updated_at);

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
