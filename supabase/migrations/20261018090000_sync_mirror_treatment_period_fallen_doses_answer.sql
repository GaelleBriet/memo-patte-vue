-- Miroir du schéma v15 : la réponse à la question des doses tombées en trois états et sa date, posées
-- par la règle de la migration locale (src/core/db/migration-v15.ts). Aucune ligne n'est supprimée.

-- Une conversion filtrée en silence par la sécurité des lignes échouerait ici au lieu de ne rien écrire.
set row_security = off;

alter table public.treatment_period
  add column fallen_doses_answer text not null default 'unasked'
    check (fallen_doses_answer in ('unasked', 'stay-unlogged', 'not-due')),
  add column fallen_doses_answered_at timestamptz;

-- Le booléen ne distinguait pas « n'étaient pas à donner » d'aucune question, et ne datait pas la
-- réponse : rien n'est retiré après coup.
update public.treatment_period
set fallen_doses_answer = 'stay-unlogged'
where past_doses_stay_unlogged = 1;

alter table public.treatment_period drop column past_doses_stay_unlogged;

grant update (fallen_doses_answer, fallen_doses_answered_at)
  on table public.treatment_period to authenticated;

reset row_security;

-- Écrête une date de réponse à plus de 24h dans le futur, comme la date d'écriture des réglages : sinon
-- une horloge déréglée gagnerait pour toujours contre un report plus récent.
create function public.clamp_fallen_doses_answered_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.fallen_doses_answered_at > now() + interval '24 hours' then
    new.fallen_doses_answered_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.clamp_fallen_doses_answered_at() from public, anon, authenticated;

create trigger treatment_period_clamp_fallen_doses_answered_at
  before insert or update on public.treatment_period
  for each row
  execute function public.clamp_fallen_doses_answered_at();
