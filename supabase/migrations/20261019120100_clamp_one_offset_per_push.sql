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
  iso constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$';
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
  held timestamptz[];
  latest timestamptz;
  shift interval;
  shifted_text text;
  expected jsonb;
  old_piece text;
  candidate text;
begin
  select coalesce(array_agg(c), '{}') into written
  from unnest(dated) c
  where incoming ->> c is not null
    and date_trunc('milliseconds', (incoming ->> c)::timestamptz)
      is distinct from date_trunc('milliseconds', (stored ->> c)::timestamptz);

  -- La grille d'avant porte la date de grille de la période remplacée : une date comme les autres,
  -- lue seulement si elle est au format ISO strict de l'app ; sinon laissée telle quelle.
  grid_text := incoming ->> 'grid_before';
  if grid_text is distinct from stored ->> 'grid_before' and pg_input_is_valid(grid_text, 'jsonb') then
    grid_written_text := grid_text::jsonb ->> 'writtenAt';
    if grid_written_text ~ iso and pg_input_is_valid(grid_written_text, 'timestamptz') then
      grid_written := grid_written_text::timestamptz;
    end if;
    if pg_input_is_valid(stored ->> 'grid_before', 'jsonb') then
      stored_grid_written := case
        when (stored ->> 'grid_before')::jsonb ->> 'writtenAt' ~ iso
          and pg_input_is_valid((stored ->> 'grid_before')::jsonb ->> 'writtenAt', 'timestamptz')
        then ((stored ->> 'grid_before')::jsonb ->> 'writtenAt')::timestamptz
      end;
    end if;
    if date_trunc('milliseconds', grid_written)
        is not distinct from date_trunc('milliseconds', stored_grid_written) then
      grid_written := null;
    end if;
  end if;

  -- Une date de grille que le serveur tient déjà, pour une autre période du traitement ou comme
  -- création de la ligne, est juste : recopiée par un geste, elle ne recule pas.
  if tg_table_name = 'treatment_period'
      and ('grid_written_at' = any(written) or grid_written is not null) then
    select coalesce(array_agg(date_trunc('milliseconds', d)) filter (where d is not null), '{}')
    into held
    from (
      select p.grid_written_at as d
      from public.treatment_period p
      where p.user_id = new.user_id and p.treatment_id = new.treatment_id and p.id <> new.id
      union all
      select case when pg_input_is_valid(p.grid_before, 'jsonb') then
          case when p.grid_before::jsonb ->> 'writtenAt' ~ iso
              and pg_input_is_valid(p.grid_before::jsonb ->> 'writtenAt', 'timestamptz')
            then (p.grid_before::jsonb ->> 'writtenAt')::timestamptz end
        end
      from public.treatment_period p
      where p.user_id = new.user_id and p.treatment_id = new.treatment_id and p.id <> new.id
      union all
      select (stored ->> 'created_at')::timestamptz
    ) known;
    if 'grid_written_at' = any(written)
        and date_trunc('milliseconds', new.grid_written_at) = any(held) then
      written := array_remove(written, 'grid_written_at');
    end if;
    if date_trunc('milliseconds', grid_written) = any(held) then
      grid_written := null;
    end if;
  end if;

  if push_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
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
      -- Seule la clé de premier niveau change : le texte gardé tel quel s'il ne dit rien d'autre.
      begin
        shifted_text := to_char((grid_written + shift) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
        expected := grid_text::jsonb || jsonb_build_object('writtenAt', shifted_text);
        old_piece := '"writtenAt":' || to_json(grid_written_text)::text;
        candidate := case when position(old_piece in grid_text) > 0 then
          overlay(grid_text placing '"writtenAt":' || to_json(shifted_text)::text
            from position(old_piece in grid_text) for length(old_piece))
        end;
        new.grid_before := case
          when pg_input_is_valid(candidate, 'jsonb') and candidate::jsonb = expected then candidate
          else expected::text
        end;
      exception when others then
        new.grid_before := grid_text;
      end;
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
