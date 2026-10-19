-- Une horloge en avance de plus de 24 h : les dates que l'écriture change reculent d'un seul écart par envoi.
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
  -- Le téléphone relit les dates à la milliseconde : une microseconde de plus les ferait « changées ».
  now_ms constant timestamptz := date_trunc('milliseconds', now());
  written text[];
  latest timestamptz;
  shift interval;
  shifted jsonb := '{}'::jsonb;
  dated_column text;
begin
  select coalesce(array_agg(c), '{}') into written
  from unnest(dated) c
  where incoming ->> c is not null
    and date_trunc('milliseconds', (incoming ->> c)::timestamptz)
      is distinct from date_trunc('milliseconds', (stored ->> c)::timestamptz);

  if push_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select date_trunc('milliseconds', p.received_at) - date_trunc('milliseconds', p.sent_at)
    into shift
    from public.sync_push p
    where p.user_id = new.user_id
      and p.id = push_id::uuid
      and p.sent_at > p.received_at + interval '24 hours';
  end if;

  select max((incoming ->> c)::timestamptz) into latest from unnest(written) c;
  if latest + coalesce(shift, interval '0') > now_ms + interval '24 hours' then
    shift := now_ms - latest;
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
