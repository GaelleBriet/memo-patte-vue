import { plannedDoseWrites } from './treatment-dose-writes'
import { resolve } from './treatment-edition-change'
import { treatmentEditionSchemaFor } from './treatment-edition-checks'
import { treatmentScheduleOf } from './treatment-schedule-adapter'
import {
  assertReadable,
  draftPeriod,
  sameSettings,
  settingsOf,
  type PlanIds,
} from './treatment-settings'
import type { PlannedDoseWrite, TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import type {
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

function changesGrid(period: TreatmentPeriodRecord, settings: TreatmentPeriodSettings): boolean {
  return (
    settings.firstDueOn !== period.firstDueOn ||
    JSON.stringify(settings.frequency) !== JSON.stringify(period.frequency)
  )
}

// Corriger une période sans prise refixe sa grille : ses décalages restés seuls partent avec, ses
// prises en plus restent.
function shiftDeletes(
  history: TreatmentWithHistory,
  periodId: string,
  writes: PlannedDoseWrite[],
): PlannedDoseWrite[] {
  const lines = history.doses.filter(
    (dose) => dose.periodId === periodId && dose.status !== 'extra',
  )
  if (lines.some((dose) => dose.status !== 'shift')) return []
  const written = new Set(writes.map(({ id }) => id))
  return lines
    .filter(({ id }) => !written.has(id))
    .map(({ id }): PlannedDoseWrite => ({ action: 'delete', id }))
}

/** Lève une `ZodError` pour une saisie refusée : rien n'est alors à écrire. */
export function editionPlan(
  history: TreatmentWithHistory,
  input: TreatmentEditionInput,
  today: string,
  ids: PlanIds,
): TreatmentPlanWrite {
  const data = treatmentEditionSchemaFor(history, today).parse(input)
  const { period, change, settings, referenceOn, move } = resolve(
    history,
    data,
    { chosenOn: data.nextDoseOn, shiftsFollowing: data.shiftsFollowing ?? true },
    today,
    data.pastDues,
  )
  const treatment = { name: data.name, type: data.type }
  if (change === 'locked') return { treatment, period: null, doses: [] }

  const doses = plannedDoseWrites(treatmentScheduleOf(history, today), move, ids)
  const corrects = change === 'correct' && !sameSettings(settings, settingsOf(period))
  const plan: TreatmentPlanWrite =
    change === 'open'
      ? { treatment, period: { action: 'open', id: ids.periodId, settings, referenceOn }, doses }
      : {
          treatment,
          period: corrects ? { action: 'correct', settings, referenceOn } : null,
          doses:
            corrects && changesGrid(period, settings)
              ? [...doses, ...shiftDeletes(history, period.id, doses)]
              : doses,
        }
  assertReadable(historyAfter(history, period, plan, today), today)
  return plan
}

function historyAfter(
  history: TreatmentWithHistory,
  current: TreatmentPeriodRecord,
  plan: TreatmentPlanWrite,
  today: string,
): Pick<TreatmentWithHistory, 'periods' | 'doses'> {
  const at = `${today}T23:59:59.999Z`
  const stamps = {
    treatmentId: history.id,
    animalId: history.animalId,
    createdAt: at,
    updatedAt: at,
  }
  const { period } = plan
  const periods =
    period === null
      ? history.periods
      : period.action === 'open'
        ? [
            ...history.periods,
            {
              ...draftPeriod(period.settings, at),
              id: period.id,
              referenceOn: period.referenceOn ?? period.settings.firstDueOn,
            },
          ]
        : history.periods.map((other) =>
            other.id === current.id
              ? {
                  ...other,
                  ...period.settings,
                  referenceOn: period.referenceOn ?? period.settings.firstDueOn,
                }
              : other,
          )
  const doses = plan.doses.reduce((lines, write) => {
    if (write.action === 'delete') return lines.filter(({ id }) => id !== write.id)
    if (write.action === 'create') {
      return [...lines, { ...write.dose, ...stamps, id: write.id, deletedAt: null }]
    }
    return lines.map((line) =>
      line.id === write.id ? { ...line, ...write.dose, updatedAt: at } : line,
    )
  }, history.doses)
  return { periods, doses }
}
