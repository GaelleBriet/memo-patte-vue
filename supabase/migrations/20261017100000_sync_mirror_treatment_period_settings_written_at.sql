-- Miroir du schéma v14 : date d'écriture des réglages de la période, posée par la règle de la
-- migration locale (src/core/db/migration-v14.ts). Aucune ligne n'est supprimée.

-- Une conversion filtrée en silence par la sécurité des lignes échouerait ici au lieu de ne rien écrire.
set row_security = off;

alter table public.treatment_period add column settings_written_at timestamptz;

-- Date d'écriture inconnue : la création, que le moteur lit comme « jamais réécrit ».
update public.treatment_period
set settings_written_at = created_at;

alter table public.treatment_period alter column settings_written_at set not null;

grant update (settings_written_at) on table public.treatment_period to authenticated;

reset row_security;
