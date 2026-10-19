import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type {
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { SettingsPlan } from '@/shared/domain/dose-calendar'

type Written = NonNullable<TreatmentPlanWrite['period']>

type Extras = Pick<
  TreatmentPeriodSettings,
  'doseQuantity' | 'doseUnit' | 'reminderOffsetMinutes' | 'reminderTime'
>

/** L'écriture de la période que `newSettings` demande : un réglage ouvert aujourd'hui, ou le courant corrigé. */
export function periodWriteOf(plan: SettingsPlan, extras: Extras, newId: () => string): Written {
  const { startsOn, firstDueOn, endsOn, frequency, times } = plan.setting
  const { gridOriginOn, firstDueChosen, fallenDosesAnswer } = plan.setting
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
  const origin = { gridOriginOn, firstDueChosen, fallenDosesAnswer }
  return plan.action === 'create'
    ? { action: 'open', id: newId(), settings, ...origin }
    : { action: 'correct', id: plan.id, settings, ...origin }
}

/** La période qu'ouvre une création ou « Reprendre » : sa première échéance, choisie, fixe sa grille. */
export function openingOf(settings: TreatmentPeriodSettings, id: string) {
  return {
    action: 'open' as const,
    id,
    settings,
    gridOriginOn: settings.firstDueOn,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked' as const,
  } satisfies Written
}

/** La période en cours corrigée sur place : elle garde sa grille et la réponse à la question. */
export function correctionOf(period: TreatmentPeriodRecord, settings: TreatmentPeriodSettings) {
  return {
    action: 'correct' as const,
    id: period.id,
    settings,
    gridOriginOn: period.gridOriginOn,
    firstDueChosen: period.firstDueChosen,
    fallenDosesAnswer: period.fallenDosesAnswer,
  } satisfies Written
}

/** Le réglage que pose l'écriture de la période, à jouer sur le carnet du moteur. */
export function settingsPlanOf(written: Written): SettingsPlan {
  const { startsOn, firstDueOn, endsOn, frequency, times } = written.settings
  const { gridOriginOn, firstDueChosen, fallenDosesAnswer } = written
  const setting = {
    startsOn,
    firstDueOn,
    gridOriginOn,
    firstDueChosen,
    fallenDosesAnswer,
    endsOn,
    frequency,
    times,
  }
  return written.action === 'open'
    ? { action: 'create', setting }
    : { action: 'rewrite', id: written.id, setting }
}
