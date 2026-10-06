import { isAfter } from 'date-fns'

import * as notifications from '@/core/notifications'
import type { Reminder, ScheduledReminder } from '@/core/notifications'
import { dueReminderPrefix, parseReminderKey, type DueReminderEntry } from './due-reminders'
import {
  DEFAULT_CARNET_REMINDER_SETTINGS,
  plannedReminders,
  type CareReminders,
  type CarnetReminderSettings,
} from './reminder-plan'

export type ReminderNotifications = Pick<
  typeof notifications,
  | 'checkPermission'
  | 'scheduleReminders'
  | 'cancelReminders'
  | 'rescheduleAll'
  | 'listScheduled'
  | 'removeDelivered'
>

/** Rappels d'un soin (`null` : aucun), et ses échéances notées dont la notification affichée est périmée. */
export type EntryReminders = {
  care: CareReminders | null
  isNoted: (dueDate: string, dueTime: string | null) => boolean
}

export const reminderNotifications: ReminderNotifications = notifications

/** Sous le plafond d'alarmes d'Android (~500), au-delà duquel le plugin fait planter l'app. */
export const MAX_SCHEDULED_REMINDERS = 400

let queue: Promise<unknown> = Promise.resolve()
let fullSync: (() => Promise<void>) | null = null
let rebuildRequested = false
let readSettings: (() => Promise<CarnetReminderSettings>) | null = null

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

/** Réglages du carnet lus par `app/` ; les réglages par défaut tant que rien n'est branché. */
export function provideCarnetReminderSettings(
  next: (() => Promise<CarnetReminderSettings>) | null,
): void {
  readSettings = next
}

export async function carnetReminderSettings(): Promise<CarnetReminderSettings> {
  return readSettings === null ? { ...DEFAULT_CARNET_REMINDER_SETTINGS } : readSettings()
}

/** Vrai après une programmation ratée deux fois, jusqu'à la synchro complète qui refait tout. */
export function isRebuildRequested(): boolean {
  return rebuildRequested
}

export function markRebuilt(): void {
  rebuildRequested = false
}

/** Une programmation ratée est rejouée une fois ; ratée encore, tout est à reconstruire. */
export async function withOneRetry(schedule: () => Promise<void>): Promise<boolean> {
  try {
    await schedule()
    return true
  } catch {
    try {
      await schedule()
      return true
    } catch (cause) {
      rebuildRequested = true
      warn(cause)
      return false
    }
  }
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
 * plugin garde une notification affichée après son annulation. Une clé de l'ancienne forme n'a pas
 * d'heure.
 */
export function notedDeliveredIds(
  scheduled: ScheduledReminder[],
  isNoted: (entry: string, dueDate: string, dueTime: string | null) => boolean,
  now: number,
): number[] {
  return scheduled.flatMap((reminder) => {
    const time = pendingTime(reminder)
    const parsed = reminder.key === undefined ? null : parseReminderKey(reminder.key)
    if (time === null || time > now || parsed === null) return []
    return isNoted(parsed.entry, parsed.dueDate, parsed.dueTime) ? [reminder.id] : []
  })
}

function keyMatcher(entries: DueReminderEntry[]) {
  const prefixes = entries.map(dueReminderPrefix)
  return (reminder: ScheduledReminder): reminder is ScheduledReminder & { key: string } =>
    reminder.key !== undefined && prefixes.some((prefix) => reminder.key!.startsWith(prefix))
}

async function cancelPending(port: CancelPort, entries: DueReminderEntry[]): Promise<void> {
  const own = (await port.listScheduled()).filter(keyMatcher(entries))
  if (own.length > 0) await port.cancelReminders(own.map(({ key }) => key))
}

function pushesOutFartherPending(reminder: Reminder, pending: ScheduledReminder[]): boolean {
  return pending.some((scheduled) => {
    const time = pendingTime(scheduled)
    return time !== null && isAfter(time, reminder.at)
  })
}

/**
 * Ne lève jamais : l'écriture en base est déjà faite. Les nouveaux rappels sont construits puis
 * programmés avant que les anciens ne soient annulés : un échec laisse les anciens en place. Sans
 * permission, rien n'est construit et les rappels de l'entrée sont annulés.
 */
export function replaceDueReminders(
  port: ReminderNotifications,
  entry: DueReminderEntry,
  build: () => EntryReminders | Promise<EntryReminders>,
): Promise<void> {
  return enqueueReminderTask(async () => {
    try {
      if (!(await port.checkPermission())) {
        await cancelPending(port, [entry])
        return
      }
      const { care, isNoted } = await build()
      const pending = await port.listScheduled()
      const isOwn = keyMatcher([entry])
      const own = pending.filter(isOwn)
      const now = Date.now()
      const others = pending.filter(
        (reminder) => !isOwn(reminder) && (pendingTime(reminder) ?? now + 1) > now,
      )
      const wanted =
        care === null ? [] : plannedReminders([care], MAX_SCHEDULED_REMINDERS - others.length)
      if (wanted.length > 0 && !(await withOneRetry(() => port.scheduleReminders(wanted)))) return

      const wantedKeys = new Set(wanted.map(({ key }) => key))
      const obsolete = own.filter(({ key }) => !wantedKeys.has(key))
      if (obsolete.length > 0) await port.cancelReminders(obsolete.map(({ key }) => key))
      const noted = notedDeliveredIds(own, (_entry, day, time) => isNoted(day, time), now)
      if (noted.length > 0) await port.removeDelivered(noted).catch(warn)

      const [firstLeftOut] = (care?.reminders ?? []).filter(({ key }) => !wantedKeys.has(key))
      if (firstLeftOut && pushesOutFartherPending(firstLeftOut, others)) void fullSync?.()
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
