import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'

import { movedDueOf } from './treatment-dose-writes'
import { periodSettingsText } from './treatment-rhythm'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import {
  isAdvanced,
  shiftedNextOn,
  type MoveBounds,
  type ShiftRemovalRefusal,
  type TreatmentDoseInput,
  type TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'
import { isStoppedBeforeStart } from '@/shared/domain/treatment-end'
import {
  formatClockTime,
  formatClockTimes,
  formatDayMonthOrYear,
  formatFullDate,
  formatLongDate,
  withoutFinalDot,
} from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** Lignes d'une période montrées avant « Voir les prises précédentes ». */
export const LINES_BEFORE_TOGGLE = 3

export type DoseLineAction =
  'change-date' | 'mark-missed' | 'mark-given' | 'remove' | 'remove-move' | 'remove-shift'

export type DoseRow = {
  dose: TreatmentDoseInput
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

export type HistoryPeriod = {
  id: string
  /** `null` quand le traitement n'a qu'une période. */
  head: { title: string; settings: string } | null
  lines: HistoryLine[]
  emptyText: string | null
  visibleLines: number
  toggle: { show: string; hide: string } | null
}

export type TreatmentHistory = { counter: string | null; periods: HistoryPeriod[] }

type HistorySchedule = Pick<
  TreatmentSchedule,
  | 'doses'
  | 'lockedMoveIds'
  | 'moveBounds'
  | 'moveRemovalRefusal'
  | 'shiftRemovalRefusal'
  | 'strandedMoveOn'
  | 'currentPeriodId'
>
type Period = TreatmentPeriodRecord

function byStartDescending(a: Period, b: Period): number {
  const [left, right] = [a, b].map(
    ({ startsOn, createdAt, id }) => `${startsOn} ${createdAt} ${id}`,
  )
  return left! < right! ? 1 : left! > right! ? -1 : 0
}

function earliest(days: (string | null)[]): string | null {
  return days.filter((day) => day !== null).sort()[0] ?? null
}

function lastDayOf(period: Period, next: Period | undefined): string | null {
  const beforeNext =
    next === undefined ? null : format(subDays(parseISO(next.startsOn), 1), 'yyyy-MM-dd')
  return earliest([period.endsOn, period.stoppedOn, beforeNext])
}

function rangeDates(from: string, to: string): { from: string; to: string } {
  return { from: formatDayMonthOrYear(from, to), to: formatLongDate(to) }
}

function headTitle(t: Translate, period: Period, next: Period | undefined): string {
  const end = lastDayOf(period, next)
  if (end === null) {
    return t('treatments.history.period.since', { date: formatLongDate(period.startsOn) })
  }
  return end <= period.startsOn
    ? t('treatments.history.period.single', { date: formatLongDate(period.startsOn) })
    : t('treatments.history.period.range', rangeDates(period.startsOn, end))
}

function hasSeveralTimes(period: Period): boolean {
  return period.times.length > 1
}

function dueTitle(t: Translate, dose: TreatmentDoseInput, period: Period): string {
  const date = formatLongDate(dose.dueOn)
  return hasSeveralTimes(period) && dose.dueTime !== null
    ? t('treatments.history.dueAt', { date, time: formatClockTime(dose.dueTime) })
    : date
}

function doseOptionsLabel(t: Translate, dose: TreatmentDoseInput, period: Period): string {
  const date = formatFullDate(dose.dueOn)
  return hasSeveralTimes(period) && dose.dueTime !== null
    ? t('treatments.detail.optionsAt', { date, time: formatClockTime(dose.dueTime) })
    : t('treatments.detail.options', { date })
}

function missedWhen(t: Translate, doses: TreatmentDoseInput[], period: Period): string {
  const days = [...new Set(doses.map(({ dueOn }) => dueOn))].sort()
  const [first, last] = [days[0]!, days.at(-1)!]
  if (first !== last) return t('treatments.history.days', rangeDates(first, last))
  const times = doses.flatMap(({ dueTime }) => (dueTime === null ? [] : [dueTime]))
  const date = formatLongDate(first)
  return hasSeveralTimes(period) && times.length > 0
    ? t('treatments.history.dayTimes', { date, times: formatClockTimes(times) })
    : date
}

function missedTitle(t: Translate, doses: TreatmentDoseInput[], period: Period): string {
  return t('treatments.history.missed', { when: missedWhen(t, doses, period) }, doses.length)
}

function missedRow(t: Translate, dose: TreatmentDoseInput, period: Period): DoseRow {
  return {
    dose,
    title: missedTitle(t, [dose], period),
    optionsLabel: doseOptionsLabel(t, dose, period),
    actions: ['mark-given', 'remove'],
  }
}

function moveBoundsOf(schedule: HistorySchedule, dose: TreatmentDoseInput): MoveBounds | null {
  if (schedule.lockedMoveIds.includes(dose.id)) return null
  try {
    return schedule.moveBounds(movedDueOf(dose))
  } catch (cause) {
    if (cause instanceof RangeError) return null
    throw cause
  }
}

export function moveText(
  t: Translate,
  dose: Pick<TreatmentDoseInput, 'status' | 'dueOn' | 'nextDueDate'>,
): string {
  const dates = {
    date: formatLongDate(dose.nextDueDate),
    due: formatDayMonthOrYear(dose.dueOn, dose.nextDueDate),
  }
  return isAdvanced(dose)
    ? t('treatments.history.advanced', dates)
    : t('treatments.history.postponed', dates)
}

function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from))
}

// Décision du 2026-10-05 : la dose revenue à sa date tomberait trop près de la suivante.
function moveRemovalHint(
  t: Translate,
  schedule: HistorySchedule,
  dose: TreatmentDoseInput,
  today: string,
): string | null {
  const refusal = schedule.moveRemovalRefusal(dose.id)
  if (refusal === null) return null
  const days = daysBetween(refusal.dueOn, refusal.nextOn)
  return t(
    'treatments.history.refusal.moveTooClose',
    { date: formatDayMonthOrYear(refusal.dueOn, today), n: days },
    days,
  )
}

function moveLine(
  t: Translate,
  schedule: HistorySchedule,
  dose: TreatmentDoseInput,
  today: string,
): HistoryLine {
  const bounds = moveBoundsOf(schedule, dose)
  const isLocked = schedule.lockedMoveIds.includes(dose.id)
  const hint = isLocked ? null : moveRemovalHint(t, schedule, dose, today)
  return {
    kind: 'move',
    dose,
    title: moveText(t, dose),
    optionsLabel: t('treatments.history.moveOptions', { date: formatFullDate(dose.dueOn) }),
    actions: isLocked ? [] : bounds === null ? ['remove-move'] : ['change-date', 'remove-move'],
    ...(hint === null ? {} : { refused: { 'remove-move': hint } }),
    bounds,
  }
}

const SHIFT_REFUSALS = {
  'later-dose': 'treatments.history.refusal.shiftLaterDose',
  'move-past-next': 'treatments.history.refusal.shiftMovePastNext',
  'move-off-rhythm': 'treatments.history.refusal.shiftMoveOffRhythm',
} as const

function shiftRefusalText(
  t: Translate,
  schedule: HistorySchedule,
  dose: TreatmentDoseInput,
  refusal: ShiftRemovalRefusal,
): string {
  const strandedOn = refusal === 'move-off-rhythm' ? schedule.strandedMoveOn(dose.id) : null
  if (strandedOn === null) return t(SHIFT_REFUSALS[refusal])
  const date = withoutFinalDot(formatDayMonthOrYear(strandedOn, dose.dueOn))
  return t(SHIFT_REFUSALS[refusal], { date })
}

// Période close, arrêtée ou finie par sa date de fin : plus de prochaine dose à annoncer.
function hasNextAfterShift(
  schedule: HistorySchedule,
  period: Period,
  nextOn: string,
  today: string,
): boolean {
  const { endsOn } = period
  return (
    period.id === schedule.currentPeriodId &&
    period.stoppedOn === null &&
    (endsOn === null || (nextOn <= endsOn && endsOn >= today))
  )
}

function shiftLine(
  t: Translate,
  schedule: HistorySchedule,
  dose: TreatmentDoseInput,
  period: Period,
  today: string,
): HistoryLine {
  const nextOn = shiftedNextOn(dose, period)
  const refusal = schedule.shiftRemovalRefusal(dose.id)
  return {
    kind: 'shift',
    dose,
    title: hasNextAfterShift(schedule, period, nextOn, today)
      ? t('treatments.history.shift', { date: formatDayMonthOrYear(nextOn, dose.dueOn) })
      : t('treatments.history.shiftWithoutNext'),
    optionsLabel: t('treatments.history.shiftOptions', { date: formatFullDate(dose.dueOn) }),
    actions: ['remove-shift'],
    ...(refusal === null
      ? {}
      : { refused: { 'remove-shift': shiftRefusalText(t, schedule, dose, refusal) } }),
  }
}

const FAMILY_RANK: Record<TreatmentDoseInput['status'], number> = {
  postponed: 0,
  given: 1,
  missed: 1,
  extra: 1,
  shift: 2,
}

// Du plus récent au plus ancien ; sur une même échéance, le report, la prise, puis le décalage.
function displayOrder(doses: TreatmentDoseInput[]): TreatmentDoseInput[] {
  const key = ({ dueOn, dueTime }: TreatmentDoseInput) => `${dueOn} ${dueTime ?? ''}`
  return [...doses].sort((a, b) =>
    key(a) === key(b) ? FAMILY_RANK[a.status] - FAMILY_RANK[b.status] : key(a) < key(b) ? 1 : -1,
  )
}

function linesOf(
  t: Translate,
  schedule: HistorySchedule,
  period: Period,
  doses: TreatmentDoseInput[],
  { lastGivenId, today }: { lastGivenId: string | undefined; today: string },
): HistoryLine[] {
  const lines: HistoryLine[] = []
  for (const dose of displayOrder([...doses].reverse())) {
    if (dose.status === 'postponed') {
      lines.push(moveLine(t, schedule, dose, today))
      continue
    }
    if (dose.status === 'shift') {
      lines.push(shiftLine(t, schedule, dose, period, today))
      continue
    }
    if (dose.status === 'extra') {
      const date = formatLongDate(dose.givenOn ?? dose.dueOn)
      lines.push({
        kind: 'extra',
        dose,
        title: t('treatments.history.extra', { date }),
        optionsLabel: t('treatments.history.extraOptions', { date: formatFullDate(dose.dueOn) }),
        actions: ['change-date', 'remove'],
      })
      continue
    }
    if (dose.status === 'given') {
      lines.push({
        kind: 'given',
        dose,
        title: dueTitle(t, dose, period),
        detail:
          dose.givenOn === null || dose.givenOn === dose.dueOn
            ? null
            : t('treatments.history.givenOn', { date: formatLongDate(dose.givenOn) }),
        isLast: dose.id === lastGivenId,
        optionsLabel: doseOptionsLabel(t, dose, period),
        actions: ['change-date', 'mark-missed', 'remove'],
      })
      continue
    }
    const previous = lines.at(-1)
    const rows = [...(previous?.kind === 'missed' ? previous.rows : []), missedRow(t, dose, period)]
    if (previous?.kind === 'missed') lines.pop()
    lines.push({
      ...rows[0]!,
      kind: 'missed',
      title: missedTitle(
        t,
        rows.map((row) => row.dose),
        period,
      ),
      rows,
    })
  }
  return lines
}

function emptyText(t: Translate, period: Period): string {
  return isStoppedBeforeStart(period)
    ? t('treatments.history.stoppedBeforeFirstDose')
    : t('treatments.history.empty')
}

function notesIn(lines: HistoryLine[]): number {
  return lines.reduce(
    (count, line) =>
      count +
      (line.kind === 'missed'
        ? line.rows.length
        : line.kind === 'move' || line.kind === 'shift'
          ? 0
          : 1),
    0,
  )
}

function lastGiven(doses: TreatmentDoseInput[]): TreatmentDoseInput | undefined {
  const rank = ({ givenOn, dueOn, dueTime }: TreatmentDoseInput) =>
    `${givenOn ?? ''} ${dueOn} ${dueTime ?? ''}`
  return doses
    .filter((dose) => dose.status === 'given')
    .reduce<TreatmentDoseInput | undefined>(
      (last, dose) => (last === undefined || rank(dose) >= rank(last) ? dose : last),
      undefined,
    )
}

export function treatmentHistory(
  t: Translate,
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  schedule: HistorySchedule,
  today: string,
): TreatmentHistory {
  const periods = [...treatment.periods].sort(byStartDescending)
  const given = schedule.doses.filter(({ status }) => status === 'given' || status === 'extra')
  const oldest = given[0]
  const last = lastGiven(schedule.doses)
  const isAlone = periods.length === 1

  return {
    counter:
      oldest === undefined
        ? null
        : t('treatments.detail.since', {
            n: given.length,
            date: formatLongDate(oldest.dueOn),
          }),
    periods: periods.map((period, index): HistoryPeriod => {
      const doses = schedule.doses.filter((dose) => dose.periodId === period.id)
      const lines = linesOf(t, schedule, period, doses, { lastGivenId: last?.id, today })
      const hidden = notesIn(lines.slice(LINES_BEFORE_TOGGLE))
      const others = index === 0 && !isAlone
      return {
        id: period.id,
        head: isAlone
          ? null
          : {
              title: headTitle(t, period, periods[index - 1]),
              settings: periodSettingsText(t, period),
            },
        lines,
        emptyText: lines.length === 0 ? emptyText(t, period) : null,
        visibleLines: hidden === 0 ? lines.length : LINES_BEFORE_TOGGLE,
        toggle:
          hidden === 0
            ? null
            : others
              ? {
                  show: t('treatments.detail.showOthers', { n: hidden }, hidden),
                  hide: t('treatments.detail.hideOthers'),
                }
              : {
                  show: t('treatments.detail.showPrevious', { n: hidden }, hidden),
                  hide: t('treatments.detail.hidePrevious'),
                },
      }
    }),
  }
}

export function treatmentDeleteTexts(t: Translate, name: string) {
  return {
    title: t('treatments.detail.deleteDialog.title', { name }),
    text: t('treatments.detail.deleteDialog.text'),
    cancel: t('treatments.detail.deleteDialog.cancel'),
    confirm: t('treatments.detail.deleteDialog.confirm'),
    deleted: t('treatments.detail.toast.deleted'),
    deletedLabel: t('treatments.detail.toast.deletedLabel', { name }),
    undo: t('treatments.detail.toast.undoDelete', { name }),
    failed: t('treatments.detail.errors.delete', { name }),
  }
}
