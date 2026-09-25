import { compareAsc, isAfter } from 'date-fns'

import * as notifications from '@/core/notifications'
import type { Reminder, ScheduledReminder } from '@/core/notifications'
import { dueReminderPrefix, parseReminderKey, type DueReminderEntry } from './due-reminders'

export type ReminderNotifications = Pick<
  typeof notifications,
  | 'checkPermission'
  | 'scheduleReminders'
  | 'cancelReminders'
  | 'rescheduleAll'
  | 'listScheduled'
  | 'removeDelivered'
>

/** Rappels d'une entrée, et ses échéances déjà notées dont la notification affichée est périmée. */
export type EntryReminders = {
  reminders: Reminder[]
  isNoted: (dueDate: string) => boolean
}

export const reminderNotifications: ReminderNotifications = notifications

/** Sous le plafond d'alarmes d'Android (~500), au-delà duquel le plugin fait planter l'app. */
export const MAX_SCHEDULED_REMINDERS = 400

let queue: Promise<unknown> = Promise.resolve()
let fullSync: (() => Promise<void>) | null = null

/** Synchro complète appelée quand le plafond empêche de programmer un rappel plus proche. */
export function provideFullReminderSync(next: (() => Promise<void>) | null): void {
  fullSync = next
}

/** File unique : une synchro complète et une écriture ne s'entrelacent jamais chez le plugin. */
export function enqueueReminderTask<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task)
  queue = run.catch(() => undefined)
  return run
}

const FIRST_DUE = 0
const FIRST_SPAN = 1
const LATER = 2

/** Échéance à venir la plus proche de chaque entrée, d'après les rappels du jour même. */
function firstUpcomingByEntry(reminders: Reminder[]): Map<string, string> {
  const first = new Map<string, string>()

  for (const { key } of reminders) {
    const parsed = parseReminderKey(key)
    if (parsed === null || parsed.moment !== 'due') continue
    const known = first.get(parsed.entry)
    if (known === undefined || parsed.dueDate < known) first.set(parsed.entry, parsed.dueDate)
  }

  return first
}

function rankOf(reminder: Reminder, first: Map<string, string>): number {
  const parsed = parseReminderKey(reminder.key)
  if (parsed === null || first.get(parsed.entry) !== parsed.dueDate) return LATER

  return parsed.moment === 'due' ? FIRST_DUE : FIRST_SPAN
}

/**
 * Rappels tenant sous le plafond, triés dans le temps : la première échéance à venir de chaque
 * entrée passe avant le reste, si lointaine soit-elle, puis les plus proches remplissent la place.
 */
export function remindersWithinCap(reminders: Reminder[], limit: number): Reminder[] {
  const byDate = [...reminders].sort((a, b) => compareAsc(a.at, b.at))
  const max = Math.max(limit, 0)
  if (byDate.length <= max) return byDate

  const first = firstUpcomingByEntry(byDate)

  return byDate
    .map((reminder, order) => ({ reminder, order, rank: rankOf(reminder, first) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, max)
    .sort((a, b) => a.order - b.order)
    .map(({ reminder }) => reminder)
}

function warn(cause: unknown): void {
  console.warn('Rappels non mis à jour :', cause)
}

type CancelPort = Pick<ReminderNotifications, 'cancelReminders' | 'listScheduled'>

/** Le plugin peut rendre l'heure en texte : `new Date` accepte les deux formes. */
export function pendingTime({ at }: ScheduledReminder): number | null {
  return at === undefined ? null : new Date(at).getTime()
}

/**
 * Notifications déjà affichées dont l'échéance est notée d'après `isNoted` de leur entrée : le
 * plugin garde une notification affichée après son annulation.
 */
export function notedDeliveredIds(
  scheduled: ScheduledReminder[],
  isNoted: (entry: string, dueDate: string) => boolean,
  now: number,
): number[] {
  return scheduled.flatMap((reminder) => {
    const time = pendingTime(reminder)
    const parsed = reminder.key === undefined ? null : parseReminderKey(reminder.key)
    if (time === null || time > now || parsed === null) return []
    return isNoted(parsed.entry, parsed.dueDate) ? [reminder.id] : []
  })
}

/** Les rappels de ces entrées, annulés, et ceux des autres encore à venir. */
async function cancelPending(
  port: CancelPort,
  entries: DueReminderEntry[],
): Promise<{ cancelled: ScheduledReminder[]; remaining: ScheduledReminder[] }> {
  const prefixes = entries.map(dueReminderPrefix)
  const matches = (key: string | undefined): key is string =>
    key !== undefined && prefixes.some((prefix) => key.startsWith(prefix))
  const pending = await port.listScheduled()
  const cancelled = pending.filter((reminder): reminder is ScheduledReminder & { key: string } =>
    matches(reminder.key),
  )
  if (cancelled.length > 0) await port.cancelReminders(cancelled.map(({ key }) => key))
  const now = Date.now()
  return {
    cancelled,
    remaining: pending.filter(
      (reminder) => !matches(reminder.key) && (pendingTime(reminder) ?? now + 1) > now,
    ),
  }
}

async function removeNotedDelivered(
  port: Pick<ReminderNotifications, 'removeDelivered'>,
  cancelled: ScheduledReminder[],
  isNoted: (dueDate: string) => boolean,
): Promise<void> {
  const ids = notedDeliveredIds(cancelled, (_entry, dueDate) => isNoted(dueDate), Date.now())
  if (ids.length > 0) await port.removeDelivered(ids).catch(warn)
}

function pushesOutFartherPending(reminder: Reminder, pending: ScheduledReminder[]): boolean {
  return pending.some((scheduled) => {
    const time = pendingTime(scheduled)
    return time !== null && isAfter(time, reminder.at)
  })
}

/**
 * Ne lève jamais : l'écriture en base est déjà faite, et la synchronisation complète au retour
 * au premier plan rattrape un échec. Sans permission, rien n'est programmé.
 */
export function replaceDueReminders(
  port: ReminderNotifications,
  entry: DueReminderEntry,
  build: () => EntryReminders | Promise<EntryReminders>,
): Promise<void> {
  return enqueueReminderTask(async () => {
    try {
      const { cancelled, remaining } = await cancelPending(port, [entry])
      if (!(await port.checkPermission())) return
      const { reminders, isNoted } = await build()
      const kept = remindersWithinCap(reminders, MAX_SCHEDULED_REMINDERS - remaining.length)
      if (kept.length > 0) await port.scheduleReminders(kept)
      await removeNotedDelivered(port, cancelled, isNoted)
      const [firstLeftOut] = reminders
        .filter((reminder) => !kept.includes(reminder))
        .sort((a, b) => compareAsc(a.at, b.at))
      if (firstLeftOut && pushesOutFartherPending(firstLeftOut, remaining)) void fullSync?.()
    } catch (cause) {
      warn(cause)
    }
  })
}

/** Ne lève jamais. Annuler ne demande pas la permission. */
export function cancelDueReminders(port: CancelPort, entries: DueReminderEntry[]): Promise<void> {
  return enqueueReminderTask(async () => {
    try {
      await cancelPending(port, entries)
    } catch (cause) {
      warn(cause)
    }
  })
}
