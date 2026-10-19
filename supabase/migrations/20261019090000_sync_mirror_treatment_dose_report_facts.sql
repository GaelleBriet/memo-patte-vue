-- Miroir du schéma v16 : l'arrivée d'avant d'un report déplacé de nouveau (jour et heure) et le rang
-- de son heure dans sa journée d'origine, posés par la règle de la migration locale
-- (src/core/db/migration-v16.ts). Aucune ligne n'est supprimée.

-- Une conversion filtrée en silence par la sécurité des lignes échouerait ici au lieu de ne rien écrire.
set row_security = off;

alter table public.treatment_dose
  add column previous_target_on date,
  add column previous_target_time text,
  add column due_rank integer check (due_rank is null or due_rank >= 1);

-- Heures `HH:mm` jointes par une virgule : la position de l'heure dans le texte donne son rang.
update public.treatment_dose dose
set due_rank = case
    when period.times is null and dose.due_time is null then 1
    when dose.due_time is not null and strpos(period.times, dose.due_time) > 0
      then (strpos(period.times, dose.due_time) - 1) / 6 + 1
  end
from public.treatment_period period
where dose.status = 'postponed'
  and period.user_id = dose.user_id
  and period.id = dose.period_id;

grant update (previous_target_on, previous_target_time, due_rank)
  on table public.treatment_dose to authenticated;

reset row_security;
