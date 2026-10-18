import { currentPeriodOf } from './treatment-reading-adapter'
import type { TreatmentRhythm } from '../schema/treatment-form.schema'
import {
  treatmentPeriodSettingsSchema,
  type TreatmentPeriodRecord,
  type TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { latestOf } from '@/shared/domain/calendar-day'
import { sortedTimes } from '@/shared/domain/clock-time'
import type { TreatmentView } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'

export type PlanIds = { periodId: string; newId: () => string }

export function rhythmOf(
  period: TreatmentPeriodRecord,
): Omit<TreatmentPeriodSettings, 'startsOn' | 'firstDueOn'> {
  return {
    frequency: period.frequency,
    times: period.times,
    doseQuantity: period.doseQuantity,
    doseUnit: period.doseUnit,
    endsOn: period.endsOn,
    reminderOffsetMinutes: period.reminderOffsetMinutes,
    reminderTime: period.reminderTime,
  }
}

export function settingsOf(period: TreatmentPeriodRecord): TreatmentPeriodSettings {
  return { startsOn: period.startsOn, firstDueOn: period.firstDueOn, ...rhythmOf(period) }
}

export function withRhythm(
  settings: TreatmentPeriodSettings,
  rhythm: TreatmentRhythm,
): TreatmentPeriodSettings {
  return {
    ...settings,
    frequency: rhythm.frequency,
    times: sortedTimes(rhythm.times),
    doseQuantity: rhythm.doseQuantity,
    doseUnit: rhythm.doseUnit,
    endsOn: rhythm.endsOn,
    reminderOffsetMinutes:
      rhythm.reminderOffsetMinutes === undefined
        ? settings.reminderOffsetMinutes
        : rhythm.reminderOffsetMinutes,
    reminderTime: rhythm.reminderTime === undefined ? settings.reminderTime : rhythm.reminderTime,
  }
}

export function sameSettings(a: TreatmentPeriodSettings, b: TreatmentPeriodSettings): boolean {
  return (
    JSON.stringify({ ...a, times: sortedTimes(a.times) }) ===
    JSON.stringify({ ...b, times: sortedTimes(b.times) })
  )
}

// B3 : la date de fin et le moment du rappel se corrigent, même après des prises.
export function changesRhythm(period: TreatmentPeriodRecord, rhythm: TreatmentRhythm): boolean {
  const before = settingsOf(period)
  return !sameSettings(before, {
    ...withRhythm(before, rhythm),
    endsOn: period.endsOn,
    reminderOffsetMinutes: period.reminderOffsetMinutes,
    reminderTime: period.reminderTime,
  })
}

export function currentPeriod(
  treatment: TreatmentWithHistory,
  view: Pick<TreatmentView, 'currentSetting'>,
): TreatmentPeriodRecord {
  const period = currentPeriodOf(treatment, view)
  if (period === null) throw new Error(`Traitement sans période : ${treatment.id}`)
  return period
}

export function lastNotedDueOn(treatment: TreatmentWithHistory, periodId?: string): string | null {
  return (
    latestOf(
      treatment.doses
        .filter(
          (dose) =>
            (dose.status === 'given' || dose.status === 'missed') &&
            (periodId === undefined || dose.periodId === periodId),
        )
        .map((dose) => dose.dueOn),
    ) ?? null
  )
}

export function changesSchedule(period: TreatmentPeriodRecord, rhythm: TreatmentRhythm): boolean {
  return (
    JSON.stringify([period.frequency, sortedTimes(period.times)]) !==
    JSON.stringify([rhythm.frequency, sortedTimes(rhythm.times)])
  )
}

export const DRAFT_ID = 'draft'

export function draftPeriod(settings: TreatmentPeriodSettings, at: string): TreatmentPeriodRecord {
  return {
    ...settings,
    gridOriginOn: settings.firstDueOn,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    fallenDosesAnsweredAt: null,
    id: DRAFT_ID,
    treatmentId: DRAFT_ID,
    animalId: DRAFT_ID,
    stoppedOn: null,
    createdAt: at,
    updatedAt: at,
    settingsWrittenAt: at,
    deletedAt: null,
  }
}

// Une première prise trop ancienne pour le rythme donnerait un calendrier que le moteur refuse de lire.
export function startsTooFarBack(
  treatment: Pick<TreatmentWithHistory, 'periods' | 'doses'>,
  settings: TreatmentPeriodSettings,
  today: string,
): boolean {
  if (!treatmentPeriodSettingsSchema.safeParse(settings).success) return false
  const at = `${today}T23:59:59.999Z`
  const drafted = { ...treatment, periods: [...treatment.periods, draftPeriod(settings, at)] }
  return readTreatment(drafted, today) === null
}

export function tooOld() {
  return { code: 'custom' as const, path: ['firstDoseOn'], message: 'tooOld' }
}
