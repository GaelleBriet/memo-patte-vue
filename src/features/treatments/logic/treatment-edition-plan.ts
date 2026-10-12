import { plannedDoseWritesOf } from './treatment-dose-writes'
import { resolve } from './treatment-edition-change'
import { treatmentEditionSchemaFor } from './treatment-edition-checks'
import { periodWriteOf } from './treatment-settings-writes'
import {
  assertReadable,
  draftPeriod,
  sameSettings,
  settingsOf,
  withRhythm,
  type PlanIds,
} from './treatment-settings'
import type { PlannedDoseWrite, TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

function periodsAfter(
  history: TreatmentWithHistory,
  currentId: string,
  period: NonNullable<TreatmentPlanWrite['period']>,
  today: string,
): TreatmentWithHistory['periods'] {
  const at = `${today}T23:59:59.999Z`
  const { gridOriginOn } = period
  if (period.action === 'open') {
    return [
      ...history.periods,
      { ...draftPeriod(period.settings, at), id: period.id, gridOriginOn },
    ]
  }
  return history.periods.map((other) =>
    other.id === currentId ? { ...other, ...period.settings, gridOriginOn } : other,
  )
}

function dosesAfter(
  history: TreatmentWithHistory,
  writes: PlannedDoseWrite[],
  today: string,
): TreatmentWithHistory['doses'] {
  const at = `${today}T23:59:59.999Z`
  const stamps = {
    treatmentId: history.id,
    animalId: history.animalId,
    createdAt: at,
    updatedAt: at,
  }
  return writes.reduce((lines, write) => {
    if (write.action === 'delete') return lines.filter(({ id }) => id !== write.id)
    if (write.action === 'create') {
      return [...lines, { ...write.dose, ...stamps, id: write.id, deletedAt: null }]
    }
    return lines.map((line) =>
      line.id === write.id ? { ...line, ...write.dose, updatedAt: at } : line,
    )
  }, history.doses)
}

/** Lève une `ZodError` pour une saisie refusée : rien n'est alors à écrire. */
export function editionPlan(
  history: TreatmentWithHistory,
  input: TreatmentEditionInput,
  today: string,
  ids: PlanIds,
): TreatmentPlanWrite {
  const data = treatmentEditionSchemaFor(history, today).parse(input)
  const { period, change, plan, move } = resolve(
    history,
    data,
    { chosenOn: data.nextDoseOn, shiftsFollowing: data.shiftsFollowing ?? true },
    today,
    data.pastDues,
  )
  const treatment = { name: data.name, type: data.type }
  if (change === 'locked') return { treatment, period: null, doses: [] }

  const settings = withRhythm(settingsOf(period), data)
  const written =
    plan !== null
      ? periodWriteOf(plan, settings, () => ids.periodId)
      : sameSettings(settings, settingsOf(period))
        ? null
        : { action: 'correct' as const, id: period.id, settings, gridOriginOn: period.gridOriginOn }
  const doses = move === null ? [] : plannedDoseWritesOf(history, move.changes, ids.newId)
  const result: TreatmentPlanWrite = { treatment, period: written, doses }
  if (written !== null || doses.length > 0) {
    assertReadable(
      {
        doses: dosesAfter(history, doses, today),
        periods:
          written === null ? history.periods : periodsAfter(history, period.id, written, today),
      },
      today,
    )
  }
  return result
}
