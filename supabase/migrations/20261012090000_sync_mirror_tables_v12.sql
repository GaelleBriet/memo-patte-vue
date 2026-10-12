-- Miroirs du schéma v12 : une colonne par sens, les lignes converties par la règle de la migration
-- locale (src/core/db/migration-v12.ts). Aucune ligne n'est supprimée.

-- Une conversion filtrée en silence par la sécurité des lignes échouerait ici au lieu de ne rien écrire.
set row_security = off;

alter table public.treatment_period rename column reference_on to grid_origin_on;
alter table public.treatment_period alter column grid_origin_on drop not null;

alter table public.treatment_dose rename column next_due_date to target_on;
alter table public.treatment_dose alter column target_on drop not null;

-- Un réglage remplacé avant son premier jour cède sa place au réglage écrit après lui ; les réglages
-- d'un traitement supprimé se rangent avec ceux supprimés au même instant.
with keyed as (
  select
    p.user_id, p.id, p.treatment_id, p.deleted_at, p.created_at, p.first_due_on,
    p.grid_origin_on as reference_on, p.stopped_on, p.frequency_value, p.frequency_unit,
    least(p.starts_on, coalesce((
      select min(newer.starts_on) from public.treatment_period newer
      where newer.user_id = p.user_id and newer.treatment_id = p.treatment_id
        and newer.deleted_at is not distinct from p.deleted_at
        and newer.created_at > p.created_at), p.starts_on)) as start_key
  from public.treatment_period p
),
ordered as (
  select keyed.*, lag(keyed.id) over (
    partition by keyed.user_id, keyed.treatment_id, keyed.deleted_at
    order by keyed.start_key, keyed.created_at, keyed.id) as previous_id
  from keyed
),
converted as (
  select o.user_id, o.id,
    case
      when previous.id is not null and previous.stopped_on is null
        and previous.frequency_value = o.frequency_value
        and previous.frequency_unit = o.frequency_unit
        and previous.reference_on = o.reference_on then null
      when case o.frequency_unit
        when 'day' then (o.first_due_on - o.reference_on) % o.frequency_value = 0
        when 'week' then (o.first_due_on - o.reference_on) % (7 * o.frequency_value) = 0
        else ((extract(year from o.first_due_on) * 12 + extract(month from o.first_due_on))
            - (extract(year from o.reference_on) * 12 + extract(month from o.reference_on)))::integer
            % o.frequency_value = 0
          and extract(day from o.first_due_on) = least(
            extract(day from o.reference_on),
            extract(day from (date_trunc('month', o.first_due_on) + interval '1 month - 1 day')))
      end then o.reference_on
      else o.first_due_on
    end as grid_origin_on
  from ordered o
  left join keyed previous on previous.user_id = o.user_id and previous.id = o.previous_id
)
update public.treatment_period period
set grid_origin_on = converted.grid_origin_on
from converted
where period.user_id = converted.user_id and period.id = converted.id
  and period.grid_origin_on is distinct from converted.grid_origin_on;

update public.treatment_dose
set target_on = null
where status not in ('postponed', 'shift') and target_on is not null;

reset row_security;
