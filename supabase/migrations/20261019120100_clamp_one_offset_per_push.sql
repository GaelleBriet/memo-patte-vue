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
  grid_text text;
  grid_written_text text;
  grid_written timestamptz;
  stored_grid_written timestamptz;
  latest timestamptz;
  shift interval;
  shifted_written_text text;
  shifted_grid_text text;
begin
  select coalesce(array_agg(c), '{}') into written
  from unnest(dated) c
  where incoming ->> c is not null
    and date_trunc('milliseconds', (incoming ->> c)::timestamptz)
      is distinct from date_trunc('milliseconds', (stored ->> c)::timestamptz);

  -- La grille d'avant porte la date de grille de la période remplacée : une date comme les autres.
  grid_text := incoming ->> 'grid_before';
  if grid_text is distinct from stored ->> 'grid_before' then
    begin
      grid_written_text := grid_text::jsonb ->> 'writtenAt';
      grid_written := grid_written_text::timestamptz;
    exception when others then
      grid_written := null;
    end;
    begin
      stored_grid_written := ((stored ->> 'grid_before')::jsonb ->> 'writtenAt')::timestamptz;
    exception when others then
      stored_grid_written := null;
    end;
    if date_trunc('milliseconds', grid_written)
        is not distinct from date_trunc('milliseconds', stored_grid_written) then
      grid_written := null;
    end if;
  end if;

  -- Une date de grille héritée que le serveur tient déjà pour une autre période du traitement est juste.
  if tg_op = 'INSERT' and tg_table_name = 'treatment_period' then
    if 'grid_written_at' = any(written) and exists (
      select 1 from public.treatment_period p
      where p.user_id = new.user_id and p.treatment_id = new.treatment_id and p.id <> new.id
        and date_trunc('milliseconds', p.grid_written_at)
          = date_trunc('milliseconds', new.grid_written_at)
    ) then
      written := array_remove(written, 'grid_written_at');
    end if;
    if grid_written is not null and exists (
      select 1 from public.treatment_period p
      where p.user_id = new.user_id and p.treatment_id = new.treatment_id and p.id <> new.id
        and date_trunc('milliseconds', p.grid_written_at) = date_trunc('milliseconds', grid_written)
    ) then
      grid_written := null;
    end if;
  end if;

  if push_id ~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select date_trunc('milliseconds', p.received_at) - date_trunc('milliseconds', p.sent_at)
    into shift
    from public.sync_push p
    where p.user_id = new.user_id
      and p.id = push_id::uuid
      and p.sent_at > p.received_at + interval '24 hours';
  end if;

  select greatest(max((incoming ->> c)::timestamptz), grid_written) into latest
  from unnest(written) c;
  if latest + coalesce(shift, interval '0') > now_ms + interval '24 hours' then
    shift := now_ms - latest;
  end if;

  -- Colonne par colonne : un enregistrement recomposé garderait la forme de la table d'avant un
  -- ajout de colonne, sur une connexion ouverte avant la migration.
  if shift is not null and (cardinality(written) > 0 or grid_written is not null) then
    if 'created_at' = any(written) then new.created_at := new.created_at + shift; end if;
    if 'updated_at' = any(written) then new.updated_at := new.updated_at + shift; end if;
    if 'deleted_at' = any(written) then new.deleted_at := new.deleted_at + shift; end if;
    if 'settings_written_at' = any(written) then
      new.settings_written_at := new.settings_written_at + shift;
    end if;
    if 'grid_written_at' = any(written) then
      new.grid_written_at := new.grid_written_at + shift;
    end if;
    if grid_written is not null then
      shifted_written_text := to_char((grid_written + shift) at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
      shifted_grid_text := replace(grid_text,
        '"writtenAt":' || to_json(grid_written_text)::text,
        '"writtenAt":' || to_json(shifted_written_text)::text);
      if shifted_grid_text = grid_text then
        shifted_grid_text :=
          (grid_text::jsonb || jsonb_build_object('writtenAt', shifted_written_text))::text;
      end if;
      new.grid_before := shifted_grid_text;
    end if;
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
