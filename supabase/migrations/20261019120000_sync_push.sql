-- Un envoi de la synchro : l'heure du téléphone quand il commence, celle du serveur à sa réception.
-- Les écritures de l'envoi s'en réclament par l'en-tête x-memopatte-sync-push.
create table public.sync_push (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  sent_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.sync_push enable row level security;

create policy sync_push_select on public.sync_push for select
  using (user_id = (select auth.uid()));

create policy sync_push_insert on public.sync_push for insert
  with check (user_id = (select auth.uid()) and public.has_active_plus());

create policy sync_push_delete on public.sync_push for delete
  using (user_id = (select auth.uid()));

revoke all on table public.sync_push from anon, authenticated;
grant select, delete on table public.sync_push to authenticated;
grant insert (user_id, id, sent_at) on table public.sync_push to authenticated;

-- Un envoi ne sert que le temps de ses écritures : ceux de la veille s'effacent à l'ouverture du suivant.
create function public.forget_old_sync_pushes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.sync_push
  where user_id = new.user_id and received_at < now() - interval '1 day';
  return null;
end;
$$;

revoke execute on function public.forget_old_sync_pushes() from public, anon, authenticated;

create trigger sync_push_forget_old
  after insert on public.sync_push
  for each row
  execute function public.forget_old_sync_pushes();
