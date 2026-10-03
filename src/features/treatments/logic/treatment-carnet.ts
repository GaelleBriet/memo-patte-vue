import { currentPeriodOf, endedOnOf, readableScheduleOf } from './treatment-schedule'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import { currentDoseText } from '@/shared/domain/current-dose'
import type { ReminderCounts } from '@/shared/domain/reminders'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type CarnetTreatmentRow = {
  id: string
  name: string
  type: string
  /** La fréquence, ou « À renseigner » pour un traitement fini ou arrêté ; `null` : illisible. */
  badge: string | null
  /** Dose du moment, fin du traitement, ou « Donnée illisible ». */
  detail: string | null
  tone: 'overdue' | 'today' | 'later'
  /** « 3 doses non renseignées » ; jamais un retard (TR-14). */
  unlogged: string | null
}

export type FinishedTreatmentRow = { id: string; name: string; detail: string }

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

const TONES = { overdue: 'overdue', today: 'today', upcoming: 'later' } as const

function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

function isOpen(schedule: TreatmentSchedule): boolean {
  return schedule.phase !== 'ended' && schedule.phase !== 'stopped'
}

/** Une ligne par traitement : à plusieurs heures encore à donner, la journée, sans heure. */
function momentDue({ currentDoses }: TreatmentSchedule): Due | null {
  const [first] = currentDoses
  if (first === undefined) return null
  return currentDoses.length > 1 ? { ...first, dueTime: null } : first
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

function ongoingRow(t: Translate, read: Read, today: string): CarnetTreatmentRow {
  const { treatment, schedule } = read
  const base = {
    id: treatment.id,
    name: treatment.name,
    type: t(`treatments.type.${treatment.type}`),
  }
  if (schedule === null) {
    return {
      ...base,
      badge: null,
      detail: t('treatments.section.unreadable'),
      tone: 'later',
      unlogged: null,
    }
  }
  const count = schedule.unloggedDoses.length
  const unlogged = count === 0 ? null : t('treatments.unlogged.title', { n: count }, count)
  const due = momentDue(schedule)
  if (!isOpen(schedule) || due === null) {
    return {
      ...base,
      badge: count === 0 ? null : t('treatments.section.toLog'),
      detail: endText(t, { treatment, schedule }, today),
      tone: 'later',
      unlogged,
    }
  }
  const period = currentPeriodOf(treatment, schedule)
  const { label, value } = currentDoseText(t, { phase: schedule.phase, due, today })
  return {
    ...base,
    badge:
      period === null
        ? null
        : t(
            `treatments.frequency.${period.frequency.unit}`,
            { n: period.frequency.value },
            period.frequency.value,
          ),
    detail:
      label === null
        ? capitalized(value ?? '')
        : t('treatments.section.dose', { label, value: value ?? '' }),
    tone:
      schedule.phase === 'overdue' || schedule.phase === 'today' ? TONES[schedule.phase] : 'later',
    unlogged,
  }
}

function finishedRow(
  t: Translate,
  read: Read & { schedule: TreatmentSchedule },
  today: string,
): FinishedTreatmentRow {
  const given = read.schedule.doses.filter(({ status }) => status === 'given').length
  const end = endText(t, read, today)
  return {
    id: read.treatment.id,
    name: read.treatment.name,
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

/**
 * Les traitements d'un animal tels que le Carnet les montre, lus par le moteur d'échéances, une
 * fois chacun : en cours (à renseigner compris, TR-31) et terminés.
 */
export function carnetTreatments(
  t: Translate,
  treatments: readonly TreatmentWithHistory[],
  today: string,
): CarnetTreatments {
  const reads = treatments.map((treatment): Read => ({
    treatment,
    schedule: readableScheduleOf(treatment, today),
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
