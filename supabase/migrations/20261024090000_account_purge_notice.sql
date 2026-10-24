-- Purge des comptes inactifs (#426) : l'avis tient pour une fin d'accès donnée ; une reprise de Plus le périme.
create table public.account_purge_notice (
  user_id uuid primary key references auth.users(id) on delete cascade,
  inactive_since timestamptz not null,
  purge_on date,
  warned_at timestamptz,
  revenuecat_erased_at timestamptz,
  check ((purge_on is null) = (warned_at is null))
);

alter table public.account_purge_notice enable row level security;
alter table public.account_purge_notice force row level security;

revoke all on table public.account_purge_notice from public, anon, authenticated, service_role;
grant select, insert, update on table public.account_purge_notice to service_role;

alter table public.account_deletion_log drop constraint account_deletion_log_origin_check;
alter table public.account_deletion_log
  add constraint account_deletion_log_origin_check check (origin in ('app', 'email', 'inactivity'));

-- Mêmes durées que supabase/functions/inactive-accounts/purge-calendar.ts, en UTC.
create function public.inactive_account_steps(at timestamptz, only_account uuid default null)
returns table (
  user_id uuid,
  email text,
  locale text,
  email_confirmed boolean,
  created_at timestamptz,
  has_plus boolean,
  plus_expires_at timestamptz,
  inactive_since timestamptz,
  purge_on date,
  warned_at timestamptz,
  revenuecat_erased_at timestamptz,
  step text,
  revenuecat_erasure_due boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with account as (
    select
      u.id,
      u.email::text as email,
      u.raw_user_meta_data ->> 'locale' as locale,
      u.email_confirmed_at is not null as email_confirmed,
      u.created_at,
      p.user_id is not null as has_plus,
      p.expires_at,
      coalesce(p.expires_at, u.created_at) as reference
    from auth.users u
    left join public.plus_entitlements p on p.user_id = u.id
    where (only_account is null or u.id = only_account)
      and not (p.user_id is not null and (p.expires_at is null or p.expires_at > at))
  ),
  dated as (
    select a.*, n.purge_on, n.warned_at, n.revenuecat_erased_at
    from account a
    left join public.account_purge_notice n on n.user_id = a.id and n.inactive_since = a.reference
  ),
  stepped as (
    select
      d.*,
      case
        when not d.email_confirmed then
          case when ((d.created_at at time zone 'UTC') + interval '7 days') at time zone 'UTC' <= at then 'delete-unconfirmed' end
        when d.warned_at is not null then
          case when (d.purge_on::timestamp at time zone 'UTC') <= at then 'delete' end
        when ((d.reference at time zone 'UTC') + interval '11 months') at time zone 'UTC' <= at then 'warn'
      end as step,
      d.has_plus
        and d.revenuecat_erased_at is null
        and ((d.reference at time zone 'UTC') + interval '60 days') at time zone 'UTC' <= at as revenuecat_due
    from dated d
  )
  select
    s.id,
    s.email,
    s.locale,
    s.email_confirmed,
    s.created_at,
    s.has_plus,
    s.expires_at,
    s.reference,
    s.purge_on,
    s.warned_at,
    s.revenuecat_erased_at,
    s.step,
    s.revenuecat_due and coalesce(s.step, '') not in ('delete', 'delete-unconfirmed')
  from stepped s
  where s.step is not null or s.revenuecat_due
$$;

revoke execute on function public.inactive_account_steps(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.inactive_account_steps(timestamptz, uuid) to service_role;
