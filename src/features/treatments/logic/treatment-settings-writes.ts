import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentPeriodSettings } from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { SettingsPlan } from '@/shared/domain/dose-calendar'
import { byStartDescending } from '@/shared/domain/treatment-periods'

type Period = NonNullable<TreatmentPlanWrite['period']>

type Extras = Pick<
  TreatmentPeriodSettings,
  'doseQuantity' | 'doseUnit' | 'reminderOffsetMinutes' | 'reminderTime'
>

/**
 * Le schéma v11 n'a que `reference_on` pour l'origine de la grille : un réglage qui hérite recopie
 * celle du précédent, un réglage qui pose la sienne l'écrit (`readTreatment` les distingue ainsi).
 */
function referenceOf(
  plan: SettingsPlan,
  periods: readonly TreatmentWithHistory['periods'][number][],
): string {
  const { gridOriginOn, firstDueOn } = plan.setting
  if (gridOriginOn !== null) return gridOriginOn
  const ordered = [...periods].sort(byStartDescending)
  const position = plan.action === 'create' ? -1 : ordered.findIndex(({ id }) => id === plan.id)
  return ordered[position + 1]?.referenceOn ?? firstDueOn
}

/** L'écriture de la période que `newSettings` demande : un réglage ouvert aujourd'hui, ou le courant corrigé. */
export function periodWriteOf(
  plan: SettingsPlan,
  history: Pick<TreatmentWithHistory, 'periods'>,
  extras: Extras,
  newId: () => string,
): Period {
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
    : { action: 'correct', settings, referenceOn }
}
