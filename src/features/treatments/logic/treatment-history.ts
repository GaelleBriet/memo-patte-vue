import { format, parseISO, subDays } from 'date-fns'

import { movedDueOf } from './treatment-dose-writes'
import { periodSettingsText } from './treatment-rhythm'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Treatment } from '../schema/treatment.schema'
import {
  isAdvanced,
  type MoveBounds,
  type TreatmentDoseInput,
  type TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'
import {
  formatClockTime,
  formatClockTimes,
  formatDayMonthOrYear,
  formatFullDate,
  formatLongDate,
} from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** Lignes d'une période montrées avant « Voir les prises précédentes ». */
export const LINES_BEFORE_TOGGLE = 3

export type DoseLineAction = 'change-date' | 'mark-missed' | 'mark-given' | 'remove' | 'remove-move'

export type DoseRow = {
  dose: TreatmentDoseInput
  title: string
  optionsLabel: string
  /** Vide : la ligne n'a pas de menu. */
  actions: DoseLineAction[]
}

export type HistoryLine =
  | (DoseRow & { kind: 'given'; detail: string | null; isLast: boolean })
  /** Prises oubliées qui se suivent ; `dose` et `actions` sont ceux de la plus récente. */
  | (DoseRow & { kind: 'missed'; rows: DoseRow[] })
  /** `bounds` : dates entre lesquelles le report se déplace, `null` s'il ne se déplace pas. */
  | (DoseRow & { kind: 'move'; bounds: MoveBounds | null })

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

type HistorySchedule = Pick<TreatmentSchedule, 'doses' | 'lockedMoveIds' | 'moveBounds'>
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
  return end === null
    ? t('treatments.history.period.since', { date: formatLongDate(period.startsOn) })
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

function moveLine(t: Translate, schedule: HistorySchedule, dose: TreatmentDoseInput): HistoryLine {
  const bounds = moveBoundsOf(schedule, dose)
  const isLocked = schedule.lockedMoveIds.includes(dose.id)
  return {
    kind: 'move',
    dose,
    title: moveText(t, dose),
    optionsLabel: t('treatments.history.moveOptions', { date: formatFullDate(dose.dueOn) }),
    actions: isLocked ? [] : bounds === null ? ['remove-move'] : ['change-date', 'remove-move'],
    bounds,
  }
}

function linesOf(
  t: Translate,
  schedule: HistorySchedule,
  period: Period,
  doses: TreatmentDoseInput[],
  lastGivenId: string | undefined,
): HistoryLine[] {
  const lines: HistoryLine[] = []
  // La ligne de décalage n'a pas encore sa maquette.
  for (const dose of doses.filter(({ status }) => status !== 'shift')) {
    if (dose.status === 'postponed') {
      lines.push(moveLine(t, schedule, dose))
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

function notesIn(lines: HistoryLine[]): number {
  return lines.reduce(
    (count, line) =>
      count + (line.kind === 'missed' ? line.rows.length : line.kind === 'given' ? 1 : 0),
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
): TreatmentHistory {
  const periods = [...treatment.periods].sort(byStartDescending)
  const given = schedule.doses.filter((dose) => dose.status === 'given')
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
      const doses = schedule.doses.filter((dose) => dose.periodId === period.id).reverse()
      const lines = linesOf(t, schedule, period, doses, last?.id)
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
        emptyText: lines.length === 0 ? t('treatments.history.empty') : null,
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

export type FinishedTreatmentRow = { id: string; name: string; detail: string }

export function finishedTreatmentRows(
  t: Translate,
  treatments: Treatment[],
  doseCounts: Record<string, number>,
): FinishedTreatmentRow[] {
  return treatments.flatMap((treatment) => {
    if (treatment.stoppedOn === null) return []
    const count = doseCounts[treatment.id] ?? 0
    return [
      {
        id: treatment.id,
        name: treatment.name,
        detail: t(
          'treatments.finished.row',
          { date: formatLongDate(treatment.stoppedOn), n: count },
          count,
        ),
      },
    ]
  })
}

export function treatmentDeleteTexts(t: Translate, name: string) {
  return {
    title: t('treatments.detail.deleteDialog.title', { name }),
    text: t('treatments.detail.deleteDialog.text'),
    cancel: t('treatments.detail.deleteDialog.cancel'),
    confirm: t('treatments.detail.deleteDialog.confirm'),
    deleted: t('treatments.detail.toast.deleted', { name }),
    failed: t('treatments.detail.errors.delete', { name }),
  }
}
