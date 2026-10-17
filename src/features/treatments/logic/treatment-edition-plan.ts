import { plannedDoseWritesOf } from './treatment-dose-writes'
import { resolve } from './treatment-edition-change'
import { treatmentEditionSchemaFor } from './treatment-edition-checks'
import { carnetReadingOf, treatmentReadingOf } from './treatment-reading-adapter'
import { periodWriteOf, settingsPlanOf } from './treatment-settings-writes'
import { sameSettings, settingsOf, withRhythm, type PlanIds } from './treatment-settings'
import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { applied, settingsApplied } from '@/shared/domain/dose-calendar'

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
        : {
            action: 'correct' as const,
            id: period.id,
            settings,
            gridOriginOn: period.gridOriginOn,
            firstDueChosen: period.firstDueChosen,
            pastDosesStayUnlogged: period.pastDosesStayUnlogged,
          }
  const changes = [...(move?.changes ?? []), ...(plan?.lines ?? [])]
  const doses = plannedDoseWritesOf(history, changes, ids.newId)
  const result: TreatmentPlanWrite = { treatment, period: written, doses }
  if (written !== null || doses.length > 0) {
    const carnet = treatmentReadingOf(history, today).input
    const settled = written === null ? carnet : settingsApplied(carnet, settingsPlanOf(written))
    carnetReadingOf(applied(settled, changes))
  }
  return result
}
