-- Miroir du schéma v13 : deux faits sur le réglage, posés par la règle de la migration locale
-- (src/core/db/migration-v13.ts). Aucune ligne n'est supprimée.

-- Une conversion filtrée en silence par la sécurité des lignes échouerait ici au lieu de ne rien écrire.
set row_security = off;

alter table public.treatment_period
  add column first_due_chosen smallint not null default 0 check (first_due_chosen in (0, 1)),
  add column past_doses_stay_unlogged smallint not null default 0
    check (past_doses_stay_unlogged in (0, 1));

grant update (first_due_chosen, past_doses_stay_unlogged)
  on table public.treatment_period to authenticated;

-- Avant ces faits, toute origine posée se lisait comme une date choisie.
update public.treatment_period
set first_due_chosen = 1
where grid_origin_on is not null;

reset row_security;
