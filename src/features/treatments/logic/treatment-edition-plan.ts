import { plannedDoseWritesOf } from './treatment-dose-writes'
import { resolve } from './treatment-edition-change'
import { treatmentEditionSchemaFor } from './treatment-edition-checks'
import { carnetReadingOf, treatmentReadingOf } from './treatment-reading-adapter'
import { correctionOf, periodWriteOf, settingsPlanOf } from './treatment-settings-writes'
import { sameSettings, settingsOf, withRhythm, type PlanIds } from './treatment-settings'
import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { applied, settingsApplied } from '@/shared/domain/dose-calendar'

/** Lève une `ZodError` pour une saisie refusée : rien n'est alors à écrire. */
export function editionPlan(
  treatment: TreatmentWithPeriods,
  input: TreatmentEditionInput,
  today: string,
  ids: PlanIds,
): TreatmentPlanWrite {
  const data = treatmentEditionSchemaFor(treatment, today).parse(input)
  const { period, change, plan, move } = resolve(
    treatment,
    data,
    { chosenOn: data.nextDoseOn, shiftsFollowing: data.shiftsFollowing ?? true },
    today,
    data.pastDues,
  )
  const identity = { name: data.name, type: data.type }
  if (change === 'locked') return { treatment: identity, period: null, doses: [] }

  const settings = withRhythm(settingsOf(period), data)
  const written =
    plan !== null
      ? periodWriteOf(plan, settings, () => ids.periodId)
      : sameSettings(settings, settingsOf(period))
        ? null
        : correctionOf(period, settings)
  const changes = [...(move?.changes ?? []), ...(plan?.lines ?? [])]
  const doses = plannedDoseWritesOf(treatment, changes, ids.newId)
  const result: TreatmentPlanWrite = { treatment: identity, period: written, doses }
  if (written !== null || doses.length > 0) {
    const carnet = treatmentReadingOf(treatment, today).input
    const settled = written === null ? carnet : settingsApplied(carnet, settingsPlanOf(written))
    carnetReadingOf(applied(settled, changes))
  }
  return result
}
