import { differenceInCalendarDays, parseISO } from 'date-fns'

import type {
  HomeReminderSource,
  HomeTreatmentSource,
  HomeVaccinationSource,
} from '../service/home-reminders.service'
import type { ReminderStatus } from '@/shared/domain/reminders'
import { treatmentSchedule, type Due } from '@/shared/domain/treatment-schedule'

type TodoDay = Pick<Due, 'dueOn' | 'dueTime'>

type Identity = Pick<HomeReminderSource, 'kind' | 'id' | 'animalId' | 'label' | 'treatmentType'> & {
  /** Vaccin jamais fait : « Premier vaccin », « Prévu le … » (Vaccins Q1 bis). */
  firstVaccine: boolean
}

/** Une ligne de soin : une dose (traitement, jour, heure) ou un vaccin. */
export type TodoDueItem = Identity &
  TodoDay & {
    group: 'due'
    key: string
    status: ReminderStatus
    /** Négatif en retard, 0 aujourd'hui. */
    daysUntil: number
  }

/** Un traitement qui a des doses non renseignées : jamais un retard (TR-14). */
export type TodoToLogItem = Identity & {
  group: 'to-log'
  key: string
  unlogged: number
  /** La dose non renseignée la plus ancienne : le traitement qui attend depuis le plus longtemps passe en tête. */
  oldest: TodoDay
}

/** Un traitement que le moteur refuse de lire (Q40). */
export type TodoUnreadableItem = Identity & { group: 'unreadable'; key: string }

export type TodoItem = TodoDueItem | TodoToLogItem | TodoUnreadableItem

function statusOf(daysUntil: number): ReminderStatus {
  if (daysUntil < 0) return 'overdue'
  if (daysUntil === 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  return 'later'
}

function identityOf(source: HomeReminderSource): Identity {
  const { kind, id, animalId, label, treatmentType } = source
  const firstVaccine = source.kind === 'vaccination' && source.lastInjectionDate === null
  return { kind, id, animalId, label, treatmentType, firstVaccine }
}

function dueItem(
  source: HomeReminderSource,
  { dueOn, dueTime }: TodoDay,
  today: string,
): TodoDueItem {
  const daysUntil = differenceInCalendarDays(parseISO(dueOn), parseISO(today))
  const day =
    source.kind === 'vaccination' ? '' : `:${dueOn}${dueTime === null ? '' : `T${dueTime}`}`
  return {
    ...identityOf(source),
    group: 'due',
    key: `${source.kind}:${source.id}${day}`,
    status: statusOf(daysUntil),
    daysUntil,
    dueOn,
    dueTime,
  }
}

function dayKey({ dueOn, dueTime }: TodoDay): string {
  return `${dueOn} ${dueTime ?? ''}`
}

function vaccinationItems(source: HomeVaccinationSource, today: string): TodoItem[] {
  if (source.dueDate === null) return []
  return [dueItem(source, { dueOn: source.dueDate, dueTime: null }, today)]
}

function treatmentItems(source: HomeTreatmentSource, today: string): TodoItem[] {
  let schedule
  try {
    schedule = treatmentSchedule({ periods: source.periods, doses: source.doses, today })
  } catch (cause) {
    if (!(cause instanceof RangeError)) throw cause
    return [{ ...identityOf(source), group: 'unreadable', key: `treatment:${source.id}` }]
  }
  const isOpen = schedule.phase !== 'ended' && schedule.phase !== 'stopped'
  const items: TodoItem[] = isOpen
    ? schedule.currentDoses.map((due) => dueItem(source, due, today))
    : []
  const [oldest] = [...schedule.unloggedDoses].sort((a, b) => dayKey(a).localeCompare(dayKey(b)))
  if (oldest !== undefined) {
    items.push({
      ...identityOf(source),
      group: 'to-log',
      key: `treatment:${source.id}:unlogged`,
      unlogged: schedule.unloggedDoses.length,
      oldest: { dueOn: oldest.dueOn, dueTime: oldest.dueTime },
    })
  }
  return items
}

/** Tout ce que « À faire » peut montrer, tous animaux confondus, avant la fenêtre de 30 jours. */
export function todoItems(sources: readonly HomeReminderSource[], today: string): TodoItem[] {
  return sources.flatMap((source) =>
    source.kind === 'vaccination' ? vaccinationItems(source, today) : treatmentItems(source, today),
  )
}
