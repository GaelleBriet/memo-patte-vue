-- Miroir du schéma v15 : la réponse à la question des doses tombées en trois états, et l'état de
-- ligne « pas à donner », posés par la règle de la migration locale (src/core/db/migration-v15.ts).
-- Aucune ligne n'est supprimée.

-- Une conversion filtrée en silence par la sécurité des lignes échouerait ici au lieu de ne rien écrire.
set row_security = off;

alter table public.treatment_period
  add column fallen_doses_answer text not null default 'unasked'
    check (fallen_doses_answer in ('unasked', 'stay-unlogged', 'not-due'));

-- Le booléen ne distinguait pas « n'étaient pas à donner » d'aucune question : rien n'est retiré après coup.
update public.treatment_period
set fallen_doses_answer = 'stay-unlogged'
where past_doses_stay_unlogged = 1;

alter table public.treatment_period drop column past_doses_stay_unlogged;

grant update (fallen_doses_answer) on table public.treatment_period to authenticated;

alter table public.treatment_dose drop constraint treatment_dose_status_check;
alter table public.treatment_dose add constraint treatment_dose_status_check
  check (status in ('given', 'missed', 'postponed', 'extra', 'shift', 'not-due'));

reset row_security;
