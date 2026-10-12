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
import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

function periodsAfter(
  history: TreatmentWithHistory,
  currentId: string,
  period: NonNullable<TreatmentPlanWrite['period']>,
  today: string,
): TreatmentWithHistory['periods'] {
  const at = `${today}T23:59:59.999Z`
  const referenceOn = period.referenceOn ?? period.settings.firstDueOn
  if (period.action === 'open') {
    return [...history.periods, { ...draftPeriod(period.settings, at), id: period.id, referenceOn }]
  }
  return history.periods.map((other) =>
    other.id === currentId ? { ...other, ...period.settings, referenceOn } : other,
  )
}

/** Lève une `ZodError` pour une saisie refusée : rien n'est alors à écrire. */
export function editionPlan(
  history: TreatmentWithHistory,
  input: TreatmentEditionInput,
  today: string,
  ids: PlanIds,
): TreatmentPlanWrite {
  const data = treatmentEditionSchemaFor(history, today).parse(input)
  const { period, change, plan } = resolve(
    history,
    data,
    { chosenOn: data.nextDoseOn },
    today,
    data.pastDues,
  )
  const treatment = { name: data.name, type: data.type }
  if (change === 'locked') return { treatment, period: null, doses: [] }

  const settings = withRhythm(settingsOf(period), data)
  const written =
    plan !== null
      ? periodWriteOf(plan, history, settings, () => ids.periodId)
      : sameSettings(settings, settingsOf(period))
        ? null
        : { action: 'correct' as const, settings, referenceOn: period.referenceOn }
  const result: TreatmentPlanWrite = { treatment, period: written, doses: [] }
  if (written !== null) {
    assertReadable(
      { doses: history.doses, periods: periodsAfter(history, period.id, written, today) },
      today,
    )
  }
  return result
}
