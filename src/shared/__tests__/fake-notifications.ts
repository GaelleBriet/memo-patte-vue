import { vi, type Mock } from 'vitest'

import type { Reminder, ScheduledReminder } from '@/core/notifications'
import type { ReminderNotifications } from '../due-reminders-schedule'

export type FakeNotifications = {
  checkPermission: Mock<() => Promise<boolean>>
  scheduleReminder: Mock<(reminder: Reminder) => Promise<void>>
  cancelReminder: Mock<(key: string) => Promise<void>>
  rescheduleAll: Mock<(reminders: Reminder[]) => Promise<void>>
  listScheduled: Mock<() => Promise<ScheduledReminder[]>>
}

/** Permission accordée par défaut. */
export function createFakeNotifications(): FakeNotifications & ReminderNotifications {
  return {
    checkPermission: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    scheduleReminder: vi.fn<(reminder: Reminder) => Promise<void>>().mockResolvedValue(),
    cancelReminder: vi.fn<(key: string) => Promise<void>>().mockResolvedValue(),
    rescheduleAll: vi.fn<(reminders: Reminder[]) => Promise<void>>().mockResolvedValue(),
    listScheduled: vi.fn<() => Promise<ScheduledReminder[]>>().mockResolvedValue([]),
  }
}
