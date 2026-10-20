-- Miroir du schéma v17 : date de la dernière écriture de la grille de la période (première échéance,
-- fréquence, origine, fin ; heures exclues) et grille d'avant son ouverture (JSON, vide si inconnue),
-- posées par la règle de la migration locale (src/core/db/migration-v17.ts). Aucune ligne n'est
-- supprimée.

-- Une conversion filtrée en silence par la sécurité des lignes échouerait ici au lieu de ne rien écrire.
set row_security = off;

alter table public.treatment_period add column grid_written_at timestamptz;
-- Sans contrôle : une valeur que l'app lit vide ne doit jamais bloquer la file d'envoi.
alter table public.treatment_period add column grid_before text;

-- Dernière écriture de la grille seule inconnue : celle des réglages, qui la contient.
update public.treatment_period
set grid_written_at = settings_written_at;

alter table public.treatment_period alter column grid_written_at set not null;

grant update (grid_written_at, grid_before) on table public.treatment_period to authenticated;

reset row_security;

-- Écrête comme settings_written_at : une horloge déréglée ne gagne pas pour toujours.
create function public.clamp_grid_written_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.grid_written_at > now() + interval '24 hours' then
    new.grid_written_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.clamp_grid_written_at() from public, anon, authenticated;

create trigger treatment_period_clamp_grid_written_at
  before insert or update on public.treatment_period
  for each row
  execute function public.clamp_grid_written_at();
