// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Reminder, ScheduledReminder } from '@/core/notifications'
import {
  cancelDueReminders,
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  replaceDueReminders,
} from '../due-reminders-schedule'
import { createFakeNotifications, type FakeNotifications } from './fake-notifications'

const ID = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

const DUE: Reminder = {
  key: `vaccination:${ID}:due`,
  title: 'titre',
  body: 'corps',
  at: new Date(2026, 9, 15, 9),
}

let notifications: FakeNotifications

beforeEach(() => {
  notifications = createFakeNotifications()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('replaceDueReminders', () => {
  it('annule les rappels de l’entrée puis programme les nouveaux', async () => {
    await replaceDueReminders(notifications, { kind: 'vaccination', id: ID }, () => [DUE])

    expect(notifications.cancelReminder.mock.calls).toEqual([
      [`vaccination:${ID}:before`],
      [`vaccination:${ID}:due`],
      [`vaccination:${ID}:overdue`],
    ])
    expect(notifications.scheduleReminder.mock.calls).toEqual([[DUE]])
    expect(notifications.cancelReminder.mock.invocationCallOrder[2]).toBeLessThan(
      notifications.scheduleReminder.mock.invocationCallOrder[0]!,
    )
  })

  it('ne programme rien sans permission et ne construit pas les rappels', async () => {
    notifications.checkPermission.mockResolvedValue(false)
    const build = vi.fn<() => Reminder[]>(() => [DUE])

    await replaceDueReminders(notifications, { kind: 'vaccination', id: ID }, build)

    expect(build).not.toHaveBeenCalled()
    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
  })

  it('ne dépasse pas le plafond de rappels en attente, en gardant les plus proches', async () => {
    const pending: ScheduledReminder[] = Array.from(
      { length: MAX_SCHEDULED_REMINDERS - 1 },
      (_, id) => ({ id, title: '', body: '' }),
    )
    notifications.listScheduled.mockResolvedValue(pending)
    const before: Reminder = {
      ...DUE,
      key: `vaccination:${ID}:before`,
      at: new Date(2026, 9, 12, 9),
    }

    await replaceDueReminders(notifications, { kind: 'vaccination', id: ID }, () => [DUE, before])

    expect(notifications.scheduleReminder.mock.calls).toEqual([[before]])
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.scheduleReminder.mockRejectedValue(new Error('plugin'))

    await expect(
      replaceDueReminders(notifications, { kind: 'vaccination', id: ID }, () => [DUE]),
    ).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('cancelDueReminders', () => {
  it('annule les rappels de chaque entrée, même sans permission', async () => {
    notifications.checkPermission.mockResolvedValue(false)

    await cancelDueReminders(notifications, [
      { kind: 'vaccination', id: ID },
      { kind: 'treatment', id: OTHER },
    ])

    expect(notifications.cancelReminder.mock.calls.flat()).toEqual([
      `vaccination:${ID}:before`,
      `vaccination:${ID}:due`,
      `vaccination:${ID}:overdue`,
      `treatment:${OTHER}:before`,
      `treatment:${OTHER}:due`,
      `treatment:${OTHER}:overdue`,
    ])
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.cancelReminder.mockRejectedValue(new Error('plugin'))

    await expect(
      cancelDueReminders(notifications, [{ kind: 'treatment', id: ID }]),
    ).resolves.toBeUndefined()
  })
})

describe('enqueueReminderTask', () => {
  it('joue les opérations de rappel l’une après l’autre, dans l’ordre d’arrivée', async () => {
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const replacing = replaceDueReminders(
      notifications,
      { kind: 'vaccination', id: ID },
      async () => {
        await blocked
        return [DUE]
      },
    )
    const cancelling = cancelDueReminders(notifications, [{ kind: 'treatment', id: OTHER }])
    const synced = vi.fn<() => Promise<void>>().mockResolvedValue()
    const syncing = enqueueReminderTask(synced)

    await vi.waitFor(() => expect(notifications.checkPermission).toHaveBeenCalled())
    expect(notifications.cancelReminder).not.toHaveBeenCalledWith(`treatment:${OTHER}:due`)
    expect(synced).not.toHaveBeenCalled()

    release()
    await Promise.all([replacing, cancelling, syncing])

    expect(notifications.scheduleReminder.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.cancelReminder.mock.invocationCallOrder[3]!,
    )
    expect(synced).toHaveBeenCalledOnce()
  })

  it('poursuit la file après une tâche en échec', async () => {
    const failing = enqueueReminderTask(() => Promise.reject(new Error('plugin')))
    const next = vi.fn<() => Promise<void>>().mockResolvedValue()

    await expect(failing).rejects.toThrow('plugin')
    await enqueueReminderTask(next)

    expect(next).toHaveBeenCalledOnce()
  })
})
