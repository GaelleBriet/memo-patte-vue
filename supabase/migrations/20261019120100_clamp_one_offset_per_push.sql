-- Une horloge déréglée de plus de 24 h : les dates que l'écriture change sont décalées d'un même
-- écart, celui de son envoi (heure du serveur à sa réception moins heure du téléphone), sinon celui
-- de sa date la plus récente ramenée à now() ; une ligne décalée qui n'est pas plus récente que celle
-- du serveur est refusée. Aucune ligne existante n'est réécrite.
create or replace function public.clamp_sync_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dated constant text[] := array[
    'created_at', 'updated_at', 'deleted_at', 'settings_written_at', 'grid_written_at'
  ];
  incoming constant jsonb := to_jsonb(new);
  stored constant jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  push_id constant text :=
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-memopatte-sync-push';
  written text[];
  latest timestamptz;
  shift interval;
  shifted jsonb := '{}'::jsonb;
  dated_column text;
begin
  select coalesce(array_agg(c), '{}') into written
  from unnest(dated) c
  where incoming ->> c is not null and (incoming -> c) is distinct from (stored -> c);

  if push_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.received_at - p.sent_at into shift
    from public.sync_push p
    where p.user_id = new.user_id
      and p.id = push_id::uuid
      and p.sent_at > p.received_at + interval '24 hours';
  end if;

  if shift is null then
    select max((incoming ->> c)::timestamptz) into latest from unnest(written) c;
    if latest > now() + interval '24 hours' then
      shift := now() - latest;
    end if;
  end if;

  if shift is not null then
    foreach dated_column in array written loop
      shifted := shifted || jsonb_build_object(
        dated_column, (incoming ->> dated_column)::timestamptz + shift);
    end loop;
    new := jsonb_populate_record(new, shifted);
    if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
      return null;
    end if;
  end if;

  new.server_updated_at := now();
  return new;
end;
$$;

revoke execute on function public.clamp_sync_timestamps() from public, anon, authenticated;

drop trigger if exists treatment_period_clamp_settings_written_at on public.treatment_period;
drop function if exists public.clamp_settings_written_at();
drop trigger if exists treatment_period_clamp_grid_written_at on public.treatment_period;
drop function if exists public.clamp_grid_written_at();
