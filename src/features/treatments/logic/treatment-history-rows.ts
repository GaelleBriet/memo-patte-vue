import { movedDueOf } from './treatment-line-actions'
import { moveText } from './treatment-move-text'
import { notDueText } from '@/shared/domain/treatment-not-due-text'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { moveBounds, reportRemovalLock, type MoveBounds } from '@/shared/domain/dose-calendar'
import { isSeveralTimesADay } from '@/shared/domain/treatment-periods'
import { nextDueAfterShift } from '@/shared/domain/treatment-shift-next'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'
import {
  formatClockTime,
  formatClockTimes,
  formatDayMonthOrYear,
  formatFullDate,
  formatLongDate,
} from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export type DoseLineAction =
  'change-date' | 'mark-missed' | 'mark-given' | 'remove' | 'remove-move' | 'remove-shift'

export type DoseRow = {
  dose: TreatmentDose
  title: string
  optionsLabel: string
  /** Vide : la ligne n'a pas de menu ; le menu montre ceux que garde `menuOf`. */
  actions: DoseLineAction[]
}

export type HistoryLine =
  | (DoseRow & { kind: 'given'; detail: string | null; isLast: boolean })
  /** Prise en plus : jamais « Dernière prise », que la dernière prise prévue garde. */
  | (DoseRow & { kind: 'extra' })
  /** Prises oubliées qui se suivent ; `dose` et `actions` sont ceux de la plus récente. */
  | (DoseRow & { kind: 'missed'; rows: DoseRow[] })
  /** `bounds` : dates entre lesquelles le report se déplace, `null` s'il ne se déplace pas. */
  | (DoseRow & { kind: 'move'; bounds: MoveBounds | null })
  /** Ligne de décalage des doses suivantes (N7). */
  | (DoseRow & { kind: 'shift' })
  /** R11 : une ligne que le calendrier ne lit plus ; seule la personne la supprime. */
  | (DoseRow & { kind: 'idle'; detail: string | null })
  | (DoseRow & { kind: 'not-due'; detail: string })

export type Entry = { dose: TreatmentDose; idle: boolean }

export type RowContext = { reading: TreatmentReading; today: string }

function dueTitle(t: Translate, dose: TreatmentDose, period: TreatmentPeriodRecord): string {
  const date = formatLongDate(dose.dueOn)
  return isSeveralTimesADay(period) && dose.dueTime !== null
    ? t('treatments.history.dueAt', { date, time: formatClockTime(dose.dueTime) })
    : date
}

function doseOptionsLabel(
  t: Translate,
  dose: TreatmentDose,
  period: TreatmentPeriodRecord,
): string {
  const date = formatFullDate(dose.dueOn)
  return isSeveralTimesADay(period) && dose.dueTime !== null
    ? t('treatments.detail.optionsAt', { date, time: formatClockTime(dose.dueTime) })
    : t('treatments.detail.options', { date })
}

function rangeDates(from: string, to: string): { from: string; to: string } {
  return { from: formatDayMonthOrYear(from, to), to: formatLongDate(to) }
}

function missedWhen(t: Translate, doses: TreatmentDose[], period: TreatmentPeriodRecord): string {
  const days = [...new Set(doses.map(({ dueOn }) => dueOn))].sort()
  const [first, last] = [days[0]!, days.at(-1)!]
  if (first !== last) return t('treatments.history.days', rangeDates(first, last))
  const times = doses.flatMap(({ dueTime }) => (dueTime === null ? [] : [dueTime]))
  const date = formatLongDate(first)
  return isSeveralTimesADay(period) && times.length > 0
    ? t('treatments.history.dayTimes', { date, times: formatClockTimes(times) })
    : date
}

export function missedTitle(
  t: Translate,
  doses: TreatmentDose[],
  period: TreatmentPeriodRecord,
): string {
  return t('treatments.history.missed', { when: missedWhen(t, doses, period) }, doses.length)
}

export function missedRow(
  t: Translate,
  dose: TreatmentDose,
  period: TreatmentPeriodRecord,
): DoseRow {
  return {
    dose,
    title: missedTitle(t, [dose], period),
    optionsLabel: doseOptionsLabel(t, dose, period),
    actions: ['mark-given', 'remove'],
  }
}

// Q55 : revenue sur son jour d'origine, la dose se lit comme une dose ordinaire de ce jour.
function reportTitle(t: Translate, dose: TreatmentDose, period: TreatmentPeriodRecord): string {
  return dose.targetOn === dose.dueOn ? dueTitle(t, dose, period) : moveText(t, dose)
}

function moveLine(
  t: Translate,
  { reading }: RowContext,
  dose: TreatmentDose,
  period: TreatmentPeriodRecord,
): HistoryLine {
  const bounds = moveBounds(reading.input, movedDueOf(dose), true)
  const found = 'refusal' in bounds ? null : bounds
  const locked = reportRemovalLock(reading.input, dose.id) !== null
  return {
    kind: 'move',
    dose,
    title: reportTitle(t, dose, period),
    optionsLabel: t('treatments.history.moveOptions', { date: formatFullDate(dose.dueOn) }),
    actions: locked ? [] : found === null ? ['remove-move'] : ['change-date', 'remove-move'],
    bounds: found,
  }
}

// R6 : la prochaine dose après la journée du décalage, lue sur le calendrier.
function shiftTitle(
  t: Translate,
  { reading }: RowContext,
  dose: TreatmentDose,
  period: TreatmentPeriodRecord,
): string {
  const next = nextDueAfterShift(reading.view, period, dose)
  return next === null
    ? t('treatments.history.shiftWithoutNext')
    : t('treatments.history.shift', { date: formatDayMonthOrYear(next, dose.dueOn) })
}

function shiftLine(
  t: Translate,
  context: RowContext,
  dose: TreatmentDose,
  period: TreatmentPeriodRecord,
): HistoryLine {
  return {
    kind: 'shift',
    dose,
    title: shiftTitle(t, context, dose, period),
    optionsLabel: t('treatments.history.shiftOptions', { date: formatFullDate(dose.dueOn) }),
    actions: ['remove-shift'],
  }
}

function idleTitle(t: Translate, dose: TreatmentDose, period: TreatmentPeriodRecord): string {
  switch (dose.status) {
    case 'postponed':
      return reportTitle(t, dose, period)
    case 'shift':
      return t('treatments.history.shiftWithoutNext')
    case 'extra':
      return t('treatments.history.extra', { date: formatLongDate(dose.givenOn ?? dose.dueOn) })
    case 'missed':
      return missedTitle(t, [dose], period)
    case 'given':
      return dueTitle(t, dose, period)
    case 'not-due':
      return notDueText(t, dose)
  }
}

function idleLine(t: Translate, dose: TreatmentDose, period: TreatmentPeriodRecord): HistoryLine {
  const noEffect = t('treatments.history.noEffect', { text: idleTitle(t, dose, period) })
  const answered = dose.status === 'not-due'
  return {
    kind: 'idle',
    dose,
    title: answered ? dueTitle(t, dose, period) : noEffect,
    detail: answered ? noEffect : null,
    optionsLabel: doseOptionsLabel(t, dose, period),
    actions: ['remove'],
  }
}

function notDueLine(t: Translate, dose: TreatmentDose, period: TreatmentPeriodRecord): HistoryLine {
  return {
    kind: 'not-due',
    dose,
    title: dueTitle(t, dose, period),
    detail: notDueText(t, dose),
    optionsLabel: doseOptionsLabel(t, dose, period),
    actions: ['remove'],
  }
}

function givenLine(
  t: Translate,
  context: RowContext,
  dose: TreatmentDose,
  period: TreatmentPeriodRecord,
  isLast: boolean,
): HistoryLine {
  return {
    kind: 'given',
    dose,
    title: dueTitle(t, dose, period),
    detail:
      dose.givenOn === null || dose.givenOn === dose.dueOn
        ? null
        : t('treatments.history.givenOn', { date: formatLongDate(dose.givenOn) }),
    isLast,
    optionsLabel: doseOptionsLabel(t, dose, period),
    actions:
      dose.dueOn <= context.today
        ? ['change-date', 'mark-missed', 'remove']
        : ['change-date', 'remove'],
  }
}

function extraLine(t: Translate, dose: TreatmentDose): HistoryLine {
  const date = formatLongDate(dose.givenOn ?? dose.dueOn)
  return {
    kind: 'extra',
    dose,
    title: t('treatments.history.extra', { date }),
    optionsLabel: t('treatments.history.extraOptions', { date: formatFullDate(dose.dueOn) }),
    actions: ['change-date', 'remove'],
  }
}

/** La ligne d'une prise qui n'est ni un oubli ni la plus récente d'une série ; les oublis se regroupent à part. */
export function lineOf(
  t: Translate,
  context: RowContext,
  period: TreatmentPeriodRecord,
  { dose, idle }: Entry,
  lastGivenId: string | undefined,
): HistoryLine | null {
  if (idle) return idleLine(t, dose, period)
  switch (dose.status) {
    case 'not-due':
      return notDueLine(t, dose, period)
    case 'postponed':
      return moveLine(t, context, dose, period)
    case 'shift':
      return shiftLine(t, context, dose, period)
    case 'extra':
      return extraLine(t, dose)
    case 'given':
      return givenLine(t, context, dose, period, dose.id === lastGivenId)
    case 'missed':
      return null
  }
}
