import { movedDueOf } from './treatment-line-actions'
import { refusalText } from './treatment-refusal-texts'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { nextDay } from '@/shared/domain/calendar-day'
import {
  isAdvanced,
  moveBounds,
  removalRefusal,
  type MoveBounds,
} from '@/shared/domain/dose-calendar'
import { isSeveralTimesADay } from '@/shared/domain/treatment-periods'
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
  dose: NewTreatmentDose
  title: string
  optionsLabel: string
  /** Vide : la ligne n'a pas de menu. */
  actions: DoseLineAction[]
  /** Actions grisées, avec l'aide qui dit pourquoi. */
  refused?: Partial<Record<DoseLineAction, string>>
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
  | (DoseRow & { kind: 'idle' })

export type Entry = { dose: NewTreatmentDose; idle: boolean }

export type RowContext = { reading: TreatmentReading; today: string }

function dueTitle(t: Translate, dose: NewTreatmentDose, period: TreatmentPeriodRecord): string {
  const date = formatLongDate(dose.dueOn)
  return isSeveralTimesADay(period) && dose.dueTime !== null
    ? t('treatments.history.dueAt', { date, time: formatClockTime(dose.dueTime) })
    : date
}

function doseOptionsLabel(
  t: Translate,
  dose: NewTreatmentDose,
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

function missedWhen(
  t: Translate,
  doses: NewTreatmentDose[],
  period: TreatmentPeriodRecord,
): string {
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
  doses: NewTreatmentDose[],
  period: TreatmentPeriodRecord,
): string {
  return t('treatments.history.missed', { when: missedWhen(t, doses, period) }, doses.length)
}

export function missedRow(
  t: Translate,
  dose: NewTreatmentDose,
  period: TreatmentPeriodRecord,
): DoseRow {
  return {
    dose,
    title: missedTitle(t, [dose], period),
    optionsLabel: doseOptionsLabel(t, dose, period),
    actions: ['mark-given', 'remove'],
  }
}

export function moveText(
  t: Translate,
  dose: Pick<NewTreatmentDose, 'status' | 'dueOn' | 'nextDueDate'>,
): string {
  const dates = {
    date: formatLongDate(dose.nextDueDate),
    due: formatDayMonthOrYear(dose.dueOn, dose.nextDueDate),
  }
  return isAdvanced({ status: dose.status, dueOn: dose.dueOn, targetOn: dose.nextDueDate })
    ? t('treatments.history.advanced', dates)
    : t('treatments.history.postponed', dates)
}

function moveLine(
  t: Translate,
  { reading, today }: RowContext,
  dose: NewTreatmentDose,
): HistoryLine {
  const bounds = moveBounds(reading.input, movedDueOf(dose), true)
  const refusal = removalRefusal(reading.input, dose.id)
  const found = 'refusal' in bounds ? null : bounds
  const locked = refusal?.reason === 'arrival-logged'
  return {
    kind: 'move',
    dose,
    title: moveText(t, dose),
    optionsLabel: t('treatments.history.moveOptions', { date: formatFullDate(dose.dueOn) }),
    actions: locked ? [] : found === null ? ['remove-move'] : ['change-date', 'remove-move'],
    ...(refusal === null || locked
      ? {}
      : { refused: { 'remove-move': refusalText(t, refusal, today) } }),
    bounds: found,
  }
}

// R6 : la prochaine dose après la journée du décalage, lue sur le calendrier.
function shiftTitle(
  t: Translate,
  { reading }: RowContext,
  dose: NewTreatmentDose,
  period: TreatmentPeriodRecord,
): string {
  const { view } = reading
  const current = period.id === view.currentSetting?.id && period.stoppedOn === null
  const next = current ? view.upcoming({ from: nextDay(dose.nextDueDate), limit: 1 })[0] : undefined
  return next === undefined
    ? t('treatments.history.shiftWithoutNext')
    : t('treatments.history.shift', { date: formatDayMonthOrYear(next.dueOn, dose.dueOn) })
}

function shiftLine(
  t: Translate,
  context: RowContext,
  dose: NewTreatmentDose,
  period: TreatmentPeriodRecord,
): HistoryLine {
  const refusal = removalRefusal(context.reading.input, dose.id)
  return {
    kind: 'shift',
    dose,
    title: shiftTitle(t, context, dose, period),
    optionsLabel: t('treatments.history.shiftOptions', { date: formatFullDate(dose.dueOn) }),
    actions: ['remove-shift'],
    ...(refusal === null
      ? {}
      : { refused: { 'remove-shift': refusalText(t, refusal, context.today) } }),
  }
}

function idleTitle(t: Translate, dose: NewTreatmentDose, period: TreatmentPeriodRecord): string {
  switch (dose.status) {
    case 'postponed':
      return moveText(t, dose)
    case 'shift':
      return t('treatments.history.shiftWithoutNext')
    case 'extra':
      return t('treatments.history.extra', { date: formatLongDate(dose.givenOn ?? dose.dueOn) })
    case 'missed':
      return missedTitle(t, [dose], period)
    case 'given':
      return dueTitle(t, dose, period)
  }
}

function idleLine(
  t: Translate,
  dose: NewTreatmentDose,
  period: TreatmentPeriodRecord,
): HistoryLine {
  return {
    kind: 'idle',
    dose,
    title: t('treatments.history.noEffect', { text: idleTitle(t, dose, period) }),
    optionsLabel: doseOptionsLabel(t, dose, period),
    actions: ['remove'],
  }
}

export function givenLine(
  t: Translate,
  dose: NewTreatmentDose,
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
    actions: ['change-date', 'mark-missed', 'remove'],
  }
}

export function extraLine(t: Translate, dose: NewTreatmentDose): HistoryLine {
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
    case 'postponed':
      return moveLine(t, context, dose)
    case 'shift':
      return shiftLine(t, context, dose, period)
    case 'extra':
      return extraLine(t, dose)
    case 'given':
      return givenLine(t, dose, period, dose.id === lastGivenId)
    case 'missed':
      return null
  }
}
