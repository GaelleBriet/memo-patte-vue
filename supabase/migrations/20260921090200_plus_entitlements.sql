create table public.plus_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null,
  product_type text not null check (product_type in ('monthly', 'annual', 'lifetime')),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.plus_entitlements enable row level security;

create policy plus_entitlements_select on public.plus_entitlements for select
  using (user_id = (select auth.uid()));
