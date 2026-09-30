import { vi, type Mock } from 'vitest'

import type { Reminder, ScheduledReminder } from '@/core/notifications'
import type { ReminderNotifications } from '../domain/due-reminders-schedule'

export type FakeNotifications = {
  checkPermission: Mock<() => Promise<boolean>>
  scheduleReminders: Mock<(reminders: Reminder[]) => Promise<void>>
  cancelReminders: Mock<(keys: string[]) => Promise<void>>
  rescheduleAll: Mock<(reminders: Reminder[]) => Promise<void>>
  listScheduled: Mock<() => Promise<ScheduledReminder[]>>
  removeDelivered: Mock<(ids: number[]) => Promise<void>>
  /** Rappels en attente, indexés par clé, comme le plugin les garderait. */
  pending: Map<string, Reminder>
  /** Identifiant de notification d'une clé, stable d'un appel à l'autre. */
  idOf: (key: string) => number
}

/** Permission accordée par défaut ; les rappels programmés restent en attente jusqu'à annulation. */
export function createFakeNotifications(): FakeNotifications & ReminderNotifications {
  const pending = new Map<string, Reminder>()
  const ids = new Map<string, number>()

  function idOf(key: string): number {
    const known = ids.get(key)
    if (known !== undefined) return known
    ids.set(key, ids.size + 1)
    return ids.size
  }

  return {
    pending,
    idOf,
    checkPermission: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    scheduleReminders: vi.fn<(reminders: Reminder[]) => Promise<void>>(async (reminders) => {
      for (const reminder of reminders) pending.set(reminder.key, reminder)
    }),
    cancelReminders: vi.fn<(keys: string[]) => Promise<void>>(async (keys) => {
      for (const key of keys) pending.delete(key)
    }),
    rescheduleAll: vi.fn<(reminders: Reminder[]) => Promise<void>>(async (reminders) => {
      pending.clear()
      for (const reminder of reminders) pending.set(reminder.key, reminder)
    }),
    listScheduled: vi.fn<() => Promise<ScheduledReminder[]>>(async () =>
      [...pending.values()].map((reminder) => ({ id: idOf(reminder.key), ...reminder })),
    ),
    removeDelivered: vi.fn<(removed: number[]) => Promise<void>>(async (removed) => {
      for (const key of pending.keys()) {
        if (removed.includes(idOf(key))) pending.delete(key)
      }
    }),
  }
}
