import { currentPeriodOf, endedOnOf, readableScheduleOf } from './treatment-schedule'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import { currentDoseText } from '@/shared/domain/current-dose'
import { overdueDays } from '@/shared/domain/due-delay'
import { reminderIcon, type ReminderCounts } from '@/shared/domain/reminders'
import type { TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { formatClockTimes, formatDayMonthOrYear, formatPeriodRange } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

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

type Read = { treatment: TreatmentWithHistory; schedule: TreatmentSchedule | null }

function isOpen(schedule: TreatmentSchedule): boolean {
  return schedule.phase !== 'ended' && schedule.phase !== 'stopped'
}

function endText(
  t: Translate,
  { treatment, schedule }: Read & { schedule: TreatmentSchedule },
  today: string,
): string | null {
  const period = currentPeriodOf(treatment, schedule)
  return currentDoseText(t, {
    phase: schedule.phase,
    due: null,
    today,
    stoppedOn: period?.stoppedOn ?? null,
    endsOn: endedOnOf(treatment, schedule, today),
  }).value
}

function rhythmText(
  t: Translate,
  read: Read & { schedule: TreatmentSchedule },
  today: string,
): string | null {
  const period = currentPeriodOf(read.treatment, read.schedule)
  if (period === null) return null
  const { value, unit } = period.frequency
  const frequency = t(`treatments.frequency.${unit}`, { n: value }, value)
  const rhythm =
    period.times.length === 0
      ? frequency
      : t('treatments.section.rhythm', { frequency, times: formatClockTimes(period.times) })
  const [due] = read.schedule.currentDoses
  if (read.schedule.phase === 'overdue' || due === undefined) return rhythm
  const complement =
    period.endsOn === null
      ? t('treatments.section.nextDose', { date: formatDayMonthOrYear(due.dueOn, today) })
      : t('treatments.section.range', formatPeriodRange(period.startsOn, period.endsOn))
  return `${rhythm} · ${complement}`
}

function overdueBadge(
  t: Translate,
  schedule: TreatmentSchedule,
  today: string,
): CarnetTreatmentRow['badge'] {
  const [due] = schedule.currentDoses
  if (schedule.phase !== 'overdue' || due === undefined) return null
  const days = overdueDays(due.dueOn, today)
  return { status: 'overdue', label: t('treatments.section.overdue', { n: days }, days) }
}

function ongoingRow(t: Translate, read: Read, today: string): CarnetTreatmentRow {
  const { treatment, schedule } = read
  const base = {
    id: treatment.id,
    name: treatment.name,
    icon: reminderIcon('treatment', treatment.type),
  }
  if (schedule === null) {
    return { ...base, detail: t('treatments.section.unreadable'), badge: null, unlogged: null }
  }
  const count = schedule.unloggedDoses.length
  const unlogged = count === 0 ? null : t('treatments.unlogged.title', { n: count }, count)
  if (!isOpen(schedule) || schedule.currentDoses.length === 0) {
    return {
      ...base,
      detail: endText(t, { treatment, schedule }, today),
      badge: count === 0 ? null : { status: 'to-log', label: t('treatments.section.toLog') },
      unlogged,
    }
  }
  return {
    ...base,
    detail: rhythmText(t, { treatment, schedule }, today),
    badge: overdueBadge(t, schedule, today),
    unlogged,
  }
}

function finishedRow(
  t: Translate,
  read: Read & { schedule: TreatmentSchedule },
  today: string,
): FinishedTreatmentRow {
  const given = read.schedule.doses.filter(
    ({ status }) => status === 'given' || status === 'extra',
  ).length
  const end = endText(t, read, today)
  return {
    id: read.treatment.id,
    name: read.treatment.name,
    icon: reminderIcon('treatment', read.treatment.type),
    detail:
      end === null
        ? t('treatments.finished.doses', { n: given }, given)
        : t('treatments.finished.row', { end, n: given }, given),
  }
}

/** Le plus urgent d'abord ; puis les traitements à renseigner, puis les illisibles. */
function urgency({ schedule }: Read): string {
  if (schedule === null) return '2'
  const [due] = schedule.currentDoses
  return isOpen(schedule) && due !== undefined ? `0 ${due.dueOn} ${due.dueTime ?? ''}` : '1'
}

function endDay(
  { treatment, schedule }: Read & { schedule: TreatmentSchedule },
  today: string,
): string {
  return (
    currentPeriodOf(treatment, schedule)?.stoppedOn ?? endedOnOf(treatment, schedule, today) ?? ''
  )
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export type ScheduleCache = {
  read(treatment: TreatmentWithHistory, today: string): TreatmentSchedule | null
}

// Chaque ligne compte : une ligne synchronisée peut être réécrite avec une date plus ancienne que la plus récente.
function versionOf({ updatedAt, periods, doses }: TreatmentWithHistory, today: string): string {
  const lines = [...periods, ...doses].map((line) => `${line.id}:${line.updatedAt}`)
  return [today, updatedAt, ...lines].join(' ')
}

/** Calendriers gardés d'un rendu à l'autre : seul un traitement modifié, ou un autre jour, est relu. */
export function carnetScheduleCache(): ScheduleCache {
  const entries = new Map<string, { version: string; schedule: TreatmentSchedule | null }>()
  return {
    read(treatment, today) {
      const version = versionOf(treatment, today)
      const known = entries.get(treatment.id)
      if (known?.version === version) return known.schedule
      const schedule = readableScheduleOf(treatment, today)
      entries.set(treatment.id, { version, schedule })
      return schedule
    },
  }
}

/**
 * Les traitements d'un animal tels que le Carnet les montre, lus par le moteur d'échéances, une
 * fois chacun : en cours (à renseigner compris, TR-31) et terminés.
 */
export function carnetTreatments(
  t: Translate,
  treatments: readonly TreatmentWithHistory[],
  today: string,
  schedules: ScheduleCache = carnetScheduleCache(),
): CarnetTreatments {
  const reads = treatments.map((treatment): Read => ({
    treatment,
    schedule: schedules.read(treatment, today),
  }))
  const isFinished = (read: Read): read is Read & { schedule: TreatmentSchedule } =>
    read.schedule !== null && read.schedule.finished
  const ongoing = reads
    .filter((read) => !isFinished(read))
    .sort((a, b) => compare(urgency(a), urgency(b)))
  const due = ongoing.filter(
    ({ schedule }) => schedule !== null && isOpen(schedule) && schedule.currentDoses.length > 0,
  )

  return {
    ongoing: ongoing.map((read) => ongoingRow(t, read, today)),
    finished: reads
      .filter(isFinished)
      .sort((a, b) => compare(endDay(b, today), endDay(a, today)))
      .map((read) => finishedRow(t, read, today)),
    summary: {
      total: due.length,
      overdue: due.filter(({ schedule }) => schedule?.phase === 'overdue').length,
      ongoing: ongoing.length,
    },
  }
}
