import { currentPeriodOf, readableReadingOf } from './treatment-reading-adapter'
import type { TreatmentWithPeriods } from '../schema/treatment-with-history.schema'
import { currentDoseText } from '@/shared/domain/current-dose'
import { overdueDays } from '@/shared/domain/due-delay'
import { reminderIcon, type ReminderCounts } from '@/shared/domain/reminders'
import type { TreatmentView } from '@/shared/domain/dose-calendar'
import { formatClockTimes, formatDayMonthOrYear, formatPeriodRange } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export type CarnetTreatmentRow = {
  id: string
  name: string
  icon: string
  /** Rythme et heures, fin du traitement, ou « Donnée illisible ». */
  detail: string | null
  badge: { status: 'overdue' | 'to-log'; label: string } | null
  /** « 3 doses non renseignées » ; jamais un retard (TR-14). */
  unlogged: string | null
}

export type FinishedTreatmentRow = { id: string; name: string; icon: string; detail: string }

export type TreatmentsSummary = ReminderCounts & {
  /** Lignes de « Traitements en cours », traitements à renseigner et illisibles compris. */
  ongoing: number
}

export type CarnetTreatments = {
  ongoing: CarnetTreatmentRow[]
  finished: FinishedTreatmentRow[]
  summary: TreatmentsSummary
}

type Read = { treatment: TreatmentWithPeriods; view: TreatmentView | null }

function isOpen(view: TreatmentView): boolean {
  return view.phase !== 'ended' && view.phase !== 'stopped'
}

function endText(
  t: Translate,
  { treatment, view }: Read & { view: TreatmentView },
  today: string,
): string | null {
  const period = currentPeriodOf(treatment, view)
  return currentDoseText(t, {
    phase: view.phase,
    due: null,
    today,
    stoppedOn: period?.stoppedOn ?? null,
    stoppedBeforeFirstDose: view.stoppedBeforeFirstDose,
    endsOn: view.phase === 'ended' ? view.endedOn : null,
  }).value
}

function rhythmText(
  t: Translate,
  read: Read & { view: TreatmentView },
  today: string,
): string | null {
  const period = currentPeriodOf(read.treatment, read.view)
  if (period === null) return null
  const { value, unit } = period.frequency
  const frequency = t(`treatments.frequency.${unit}`, { n: value }, value)
  const rhythm =
    period.times.length === 0
      ? frequency
      : t('treatments.section.rhythm', { frequency, times: formatClockTimes(period.times) })
  const [due] = read.view.currentDoses
  if (read.view.phase === 'overdue' || due === undefined) return rhythm
  const complement =
    period.endsOn === null
      ? t('treatments.section.nextDose', { date: formatDayMonthOrYear(due.dueOn, today) })
      : t('treatments.section.range', formatPeriodRange(period.startsOn, period.endsOn))
  return `${rhythm} · ${complement}`
}

function overdueBadge(
  t: Translate,
  view: TreatmentView,
  today: string,
): CarnetTreatmentRow['badge'] {
  const [due] = view.currentDoses
  if (view.phase !== 'overdue' || due === undefined) return null
  const days = overdueDays(due.dueOn, today)
  return { status: 'overdue', label: t('treatments.section.overdue', { n: days }, days) }
}

function ongoingRow(t: Translate, read: Read, today: string): CarnetTreatmentRow {
  const { treatment, view } = read
  const base = {
    id: treatment.id,
    name: treatment.name,
    icon: reminderIcon('treatment', treatment.type),
  }
  if (view === null) {
    return { ...base, detail: t('treatments.section.unreadable'), badge: null, unlogged: null }
  }
  const count = view.unloggedDoses.length
  const unlogged = count === 0 ? null : t('treatments.unlogged.title', { n: count }, count)
  if (!isOpen(view) || view.currentDoses.length === 0) {
    return {
      ...base,
      detail: endText(t, { treatment, view }, today),
      badge: count === 0 ? null : { status: 'to-log', label: t('treatments.section.toLog') },
      unlogged,
    }
  }
  return {
    ...base,
    detail: rhythmText(t, { treatment, view }, today),
    badge: overdueBadge(t, view, today),
    unlogged,
  }
}

function finishedRow(
  t: Translate,
  read: Read & { view: TreatmentView },
  today: string,
): FinishedTreatmentRow {
  const given = read.view.history.filter(
    ({ line, effect }) =>
      effect.kind !== 'idle' && (line.status === 'given' || line.status === 'extra'),
  ).length
  const end = endText(t, read, today)
  const neverDue = read.view.stoppedBeforeFirstDose
  return {
    id: read.treatment.id,
    name: read.treatment.name,
    icon: reminderIcon('treatment', read.treatment.type),
    detail:
      end === null
        ? t('treatments.finished.doses', { n: given }, given)
        : neverDue
          ? end
          : t('treatments.finished.row', { end, n: given }, given),
  }
}

/** Le plus urgent d'abord ; puis les traitements à renseigner, puis les illisibles. */
function urgency({ view }: Read): string {
  if (view === null) return '2'
  const [due] = view.currentDoses
  return isOpen(view) && due !== undefined ? `0 ${due.dueOn} ${due.dueTime ?? ''}` : '1'
}

function endDay({ view }: Read & { view: TreatmentView }): string {
  return view.endedOn ?? ''
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export type ViewCache = {
  read(treatment: TreatmentWithPeriods, today: string): TreatmentView | null
}

// Chaque ligne compte : une ligne synchronisée peut être réécrite avec une date plus ancienne que la plus récente.
function versionOf({ updatedAt, periods, doses }: TreatmentWithPeriods, today: string): string {
  const lines = [...periods, ...doses].map((line) => `${line.id}:${line.updatedAt}`)
  return [today, updatedAt, ...lines].join(' ')
}

/** Vues gardées d'un rendu à l'autre : seul un traitement modifié, ou un autre jour, est relu. */
export function carnetViewCache(): ViewCache {
  const entries = new Map<string, { version: string; view: TreatmentView | null }>()
  return {
    read(treatment, today) {
      const version = versionOf(treatment, today)
      const known = entries.get(treatment.id)
      if (known?.version === version) return known.view
      const view = readableReadingOf(treatment, today)?.view ?? null
      entries.set(treatment.id, { version, view })
      return view
    },
  }
}

/**
 * Les traitements d'un animal tels que le Carnet les montre, lus par le moteur d'échéances, une
 * fois chacun : en cours (à renseigner compris, TR-31) et terminés. Pour un animal qu'on ne suit
 * plus, un traitement arrêté ou fini est terminé, doses non renseignées comprises (TR-37).
 */
export function carnetTreatments(
  t: Translate,
  treatments: readonly TreatmentWithPeriods[],
  today: string,
  views: ViewCache = carnetViewCache(),
  { followed = true }: { followed?: boolean } = {},
): CarnetTreatments {
  const reads = treatments.map((treatment): Read => ({
    treatment,
    view: views.read(treatment, today),
  }))
  const isFinished = (read: Read): read is Read & { view: TreatmentView } =>
    read.view !== null && (read.view.finished || (!followed && !isOpen(read.view)))
  const ongoing = reads
    .filter((read) => !isFinished(read))
    .sort((a, b) => compare(urgency(a), urgency(b)))
  const due = ongoing.filter(
    ({ view }) => view !== null && isOpen(view) && view.currentDoses.length > 0,
  )

  return {
    ongoing: ongoing.map((read) => ongoingRow(t, read, today)),
    finished: reads
      .filter(isFinished)
      .sort((a, b) => compare(endDay(b), endDay(a)))
      .map((read) => finishedRow(t, read, today)),
    summary: {
      total: due.length,
      overdue: due.filter(({ view }) => view?.phase === 'overdue').length,
      ongoing: ongoing.length,
    },
  }
}
