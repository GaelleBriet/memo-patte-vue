import { vi, type Mock } from 'vitest'

import type { Reminder, ScheduledReminder } from '@/core/notifications'
import type { ReminderNotifications } from '@/core/notifications/due-reminders-schedule'

export type FakeNotifications = {
  checkPermission: Mock<() => Promise<boolean>>
  canScheduleExact: Mock<() => Promise<boolean>>
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

/**
 * Permission accordée et rappels précis inactifs par défaut ; les rappels programmés restent en
 * attente jusqu'à annulation.
 */
export function createFakeNotifications(): FakeNotifications & ReminderNotifications {
  const pending = new Map<string, Reminder>()
  const ids = new Map<string, number>()
  const exactKeys = new Set<string>()

  function idOf(key: string): number {
    const known = ids.get(key)
    if (known !== undefined) return known
    ids.set(key, ids.size + 1)
    return ids.size
  }

  const canScheduleExact = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)

  async function place(reminders: Reminder[]): Promise<void> {
    const exact = await canScheduleExact()
    for (const reminder of reminders) {
      pending.set(reminder.key, reminder)
      if (exact) exactKeys.add(reminder.key)
      else exactKeys.delete(reminder.key)
    }
  }

  return {
    pending,
    idOf,
    checkPermission: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    canScheduleExact,
    scheduleReminders: vi.fn<(reminders: Reminder[]) => Promise<void>>(place),
    cancelReminders: vi.fn<(keys: string[]) => Promise<void>>(async (keys) => {
      for (const key of keys) pending.delete(key)
    }),
    rescheduleAll: vi.fn<(reminders: Reminder[]) => Promise<void>>(async (reminders) => {
      pending.clear()
      await place(reminders)
    }),
    listScheduled: vi.fn<() => Promise<ScheduledReminder[]>>(async () =>
      [...pending.values()].map((reminder) => ({
        id: idOf(reminder.key),
        ...reminder,
        exact: exactKeys.has(reminder.key),
      })),
    ),
    removeDelivered: vi.fn<(removed: number[]) => Promise<void>>(async (removed) => {
      for (const key of pending.keys()) {
        if (removed.includes(idOf(key))) pending.delete(key)
      }
    }),
  }
}
