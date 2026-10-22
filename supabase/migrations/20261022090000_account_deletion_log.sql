-- Une ligne par compte supprimé : la date et l'origine, rien qui désigne la personne.
create table public.account_deletion_log (
  deleted_on date not null default current_date,
  origin text not null check (origin in ('app', 'email'))
);

alter table public.account_deletion_log enable row level security;
alter table public.account_deletion_log force row level security;

revoke all on table public.account_deletion_log from public, anon, authenticated, service_role;
grant select, insert on table public.account_deletion_log to service_role;
