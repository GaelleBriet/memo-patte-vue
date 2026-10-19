import { menuOf } from './treatment-history-menu'
import { periodSettingsText } from './treatment-rhythm'
import {
  lineOf,
  missedRow,
  missedTitle,
  type DoseLineAction,
  type DoseRow,
  type Entry,
  type HistoryLine,
  type RowContext,
} from './treatment-history-rows'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-history.schema'
import { byStartDescending, periodLastDay } from '@/shared/domain/treatment-periods'
import { historyEntries, type TreatmentReading } from '@/shared/domain/treatment-reading'
import { formatLongDate, formatDayMonthOrYear } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export { moveText } from './treatment-move-text'
export type { DoseLineAction, DoseRow, HistoryLine } from './treatment-history-rows'

/** Lignes d'une période montrées avant « Voir les prises précédentes ». */
export const LINES_BEFORE_TOGGLE = 3

export type HistoryPeriod = {
  id: string
  /** `null` quand le traitement n'a qu'une période. */
  head: { title: string; settings: string } | null
  lines: HistoryLine[]
  emptyText: string | null
  visibleLines: number
  toggle: { show: string; hide: string } | null
}

export type TreatmentHistory = {
  counter: string | null
  periods: HistoryPeriod[]
  /** Les choix du menu ⋮ d'une ligne, à lire à son ouverture. */
  menuOf: (row: DoseRow) => DoseLineAction[]
}

type Period = TreatmentPeriodRecord

const FAMILY_RANK: Record<TreatmentDose['status'], number> = {
  postponed: 0,
  given: 1,
  missed: 1,
  extra: 1,
  'not-due': 2,
  shift: 3,
}

function rangeDates(from: string, to: string): { from: string; to: string } {
  return { from: formatDayMonthOrYear(from, to), to: formatLongDate(to) }
}

function headTitle(t: Translate, period: Period, next: Period | undefined): string {
  const end = periodLastDay(period, next)
  if (end === null) {
    return t('treatments.history.period.since', { date: formatLongDate(period.startsOn) })
  }
  return end <= period.startsOn
    ? t('treatments.history.period.single', { date: formatLongDate(period.startsOn) })
    : t('treatments.history.period.range', rangeDates(period.startsOn, end))
}

// Du plus récent au plus ancien ; sur une même échéance, le report, la prise, puis le décalage.
function displayOrder(entries: Entry[]): Entry[] {
  const key = ({ dose }: Entry) => `${dose.dueOn} ${dose.dueTime ?? ''}`
  return [...entries].sort((a, b) =>
    key(a) === key(b)
      ? FAMILY_RANK[a.dose.status] - FAMILY_RANK[b.dose.status]
      : key(a) < key(b)
        ? 1
        : -1,
  )
}

function linesOf(
  t: Translate,
  context: RowContext,
  period: Period,
  entries: Entry[],
  lastGivenId: string | undefined,
): HistoryLine[] {
  const lines: HistoryLine[] = []
  for (const entry of displayOrder([...entries].reverse())) {
    const line = lineOf(t, context, period, entry, lastGivenId)
    if (line !== null) {
      lines.push(line)
      continue
    }
    const previous = lines.at(-1)
    const rows: DoseRow[] = [
      ...(previous?.kind === 'missed' ? previous.rows : []),
      missedRow(t, entry.dose, period),
    ]
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

function isClosed(period: Period, next: Period | undefined, today: string): boolean {
  return (
    period.stoppedOn !== null ||
    next !== undefined ||
    (period.endsOn !== null && period.endsOn < today)
  )
}

function emptyText(
  t: Translate,
  period: Period,
  next: Period | undefined,
  { reading, today }: RowContext,
): string {
  if (period.stoppedOn !== null && reading.view.stoppedBeforeFirstDose) {
    return t('treatments.history.noDose')
  }
  return isClosed(period, next, today)
    ? t('treatments.history.emptyClosed')
    : t('treatments.history.empty')
}

function singleDayOf(line: HistoryLine): string | null {
  if (line.kind !== 'missed') return line.dose.dueOn
  const days = new Set(line.rows.map(({ dose }) => dose.dueOn))
  return days.size === 1 ? line.dose.dueOn : null
}

function foldAt(lines: HistoryLine[]): number {
  const day = lines[LINES_BEFORE_TOGGLE - 1] && singleDayOf(lines[LINES_BEFORE_TOGGLE - 1]!)
  let cut = LINES_BEFORE_TOGGLE
  while (day && cut < lines.length && singleDayOf(lines[cut]!) === day) cut += 1
  return cut
}

function notesIn(lines: HistoryLine[]): number {
  return lines.reduce(
    (count, line) =>
      count +
      (line.kind === 'missed'
        ? line.rows.length
        : line.kind === 'move' ||
            line.kind === 'shift' ||
            line.kind === 'idle' ||
            line.kind === 'not-due'
          ? 0
          : 1),
    0,
  )
}

function lastPlannedDoseGiven(entries: Entry[]): TreatmentDose | undefined {
  const rank = ({ givenOn, dueOn, dueTime }: TreatmentDose) =>
    `${givenOn ?? ''} ${dueOn} ${dueTime ?? ''}`
  return entries
    .filter(({ dose, idle }) => !idle && dose.status === 'given')
    .map(({ dose }) => dose)
    .reduce<TreatmentDose | undefined>(
      (last, dose) => (last === undefined || rank(dose) >= rank(last) ? dose : last),
      undefined,
    )
}

// R12 : chaque ligne du traitement, lue avec son effet sur le calendrier.
function entriesOf(
  treatment: Pick<TreatmentWithPeriods, 'doses'>,
  { view }: TreatmentReading,
): Entry[] {
  const records = new Map(treatment.doses.map((dose) => [dose.id, dose]))
  return historyEntries(view).flatMap(({ line, idle }) => {
    const dose = records.get(line.id)
    return dose === undefined ? [] : [{ dose, idle }]
  })
}

export function treatmentHistory(
  t: Translate,
  treatment: Pick<TreatmentWithPeriods, 'periods' | 'doses'>,
  reading: TreatmentReading,
  today: string,
): TreatmentHistory {
  const periods = [...treatment.periods].sort(byStartDescending)
  const entries = entriesOf(treatment, reading)
  const given = entries.filter(
    ({ dose, idle }) => !idle && (dose.status === 'given' || dose.status === 'extra'),
  )
  const oldest = given[0]
  const last = lastPlannedDoseGiven(entries)
  const isAlone = periods.length === 1
  const context = { reading, today }

  return {
    counter:
      oldest === undefined
        ? null
        : t('treatments.detail.since', {
            n: given.length,
            date: formatLongDate(oldest.dose.dueOn),
          }),
    menuOf: (row) => menuOf(context, row),
    periods: periods.map((period, index): HistoryPeriod => {
      const own = entries.filter(({ dose }) => dose.periodId === period.id)
      const lines = linesOf(t, context, period, own, last?.id)
      const cut = foldAt(lines)
      const hidden = notesIn(lines.slice(cut))
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
        emptyText: lines.length === 0 ? emptyText(t, period, periods[index - 1], context) : null,
        visibleLines: hidden === 0 ? lines.length : cut,
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
