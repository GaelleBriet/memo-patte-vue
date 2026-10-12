import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentPeriodSettings } from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { SettingsPlan } from '@/shared/domain/dose-calendar'
import { previousPeriod, type OrderedPeriod } from '@/shared/domain/treatment-reading'

type Written = NonNullable<TreatmentPlanWrite['period']>

type Extras = Pick<
  TreatmentPeriodSettings,
  'doseQuantity' | 'doseUnit' | 'reminderOffsetMinutes' | 'reminderTime'
>

const NEWEST = '9999-12-31T23:59:59.999Z'

/**
 * Le schéma v11 n'a que `reference_on` pour l'origine de la grille : un réglage qui hérite recopie
 * celle du précédent, un réglage qui pose la sienne l'écrit (`readTreatment` les distingue ainsi).
 */
function referenceOf(plan: SettingsPlan, periods: readonly OrderedPeriod[]): string {
  const { gridOriginOn, firstDueOn, startsOn, frequency } = plan.setting
  if (gridOriginOn !== null) return gridOriginOn
  const existing = plan.action === 'rewrite' ? periods.find(({ id }) => id === plan.id) : undefined
  const candidate: OrderedPeriod = {
    ...(existing ?? { id: 'nouveau', referenceOn: firstDueOn, stoppedOn: null, createdAt: NEWEST }),
    startsOn,
    frequency,
  }
  return previousPeriod(periods, candidate)?.referenceOn ?? firstDueOn
}

/** L'écriture de la période que `newSettings` demande : un réglage ouvert aujourd'hui, ou le courant corrigé. */
export function periodWriteOf(
  plan: SettingsPlan,
  history: Pick<TreatmentWithHistory, 'periods'>,
  extras: Extras,
  newId: () => string,
): Written {
  const { startsOn, firstDueOn, endsOn, frequency, times } = plan.setting
  const { doseQuantity, doseUnit, reminderOffsetMinutes, reminderTime } = extras
  const settings: TreatmentPeriodSettings = {
    startsOn,
    firstDueOn,
    endsOn,
    frequency,
    times: [...times],
    doseQuantity,
    doseUnit,
    reminderOffsetMinutes,
    reminderTime,
  }
  const referenceOn = referenceOf(plan, history.periods)
  return plan.action === 'create'
    ? { action: 'open', id: newId(), settings, referenceOn }
    : { action: 'correct', id: plan.id, settings, referenceOn }
}
