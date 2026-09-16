import { vi, type Mock } from 'vitest'

import type { Reminder, ScheduledReminder } from '@/core/notifications'
import type { ReminderNotifications } from '../due-reminders-schedule'

export type FakeNotifications = {
  checkPermission: Mock<() => Promise<boolean>>
  scheduleReminders: Mock<(reminders: Reminder[]) => Promise<void>>
  cancelReminders: Mock<(keys: string[]) => Promise<void>>
  rescheduleAll: Mock<(reminders: Reminder[]) => Promise<void>>
  listScheduled: Mock<() => Promise<ScheduledReminder[]>>
  /** Rappels en attente, indexés par clé, comme le plugin les garderait. */
  pending: Map<string, Reminder>
}

/** Permission accordée par défaut ; les rappels programmés restent en attente jusqu'à annulation. */
export function createFakeNotifications(): FakeNotifications & ReminderNotifications {
  const pending = new Map<string, Reminder>()

  return {
    pending,
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
      [...pending.values()].map((reminder, id) => ({ id, ...reminder })),
    ),
  }
}
