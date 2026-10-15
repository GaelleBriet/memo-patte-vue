import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentPeriodSettings } from '../schema/treatment-period.schema'
import type { SettingsPlan } from '@/shared/domain/dose-calendar'

type Written = NonNullable<TreatmentPlanWrite['period']>

type Extras = Pick<
  TreatmentPeriodSettings,
  'doseQuantity' | 'doseUnit' | 'reminderOffsetMinutes' | 'reminderTime'
>

/** L'écriture de la période que `newSettings` demande : un réglage ouvert aujourd'hui, ou le courant corrigé. */
export function periodWriteOf(plan: SettingsPlan, extras: Extras, newId: () => string): Written {
  const { startsOn, firstDueOn, endsOn, frequency, times } = plan.setting
  const { gridOriginOn, firstDueChosen, pastDosesStayUnlogged } = plan.setting
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
  const origin = { gridOriginOn, firstDueChosen, pastDosesStayUnlogged }
  return plan.action === 'create'
    ? { action: 'open', id: newId(), settings, ...origin }
    : { action: 'correct', id: plan.id, settings, ...origin }
}
