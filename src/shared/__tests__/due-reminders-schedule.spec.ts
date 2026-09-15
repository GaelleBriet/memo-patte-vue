// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Reminder } from '@/core/notifications'
import {
  cancelDueReminders,
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  replaceDueReminders,
} from '../due-reminders-schedule'
import { createFakeNotifications, type FakeNotifications } from './fake-notifications'

const ID = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

function reminder(key: string, at = new Date(2026, 9, 15, 9)): Reminder {
  return { key, title: 'titre', body: 'corps', at }
}

const DUE = reminder(`treatment:${ID}:2026-10-15:due`)

let notifications: FakeNotifications

beforeEach(() => {
  notifications = createFakeNotifications()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function seed(...keys: string[]): void {
  for (const key of keys) notifications.pending.set(key, reminder(key))
}

describe('replaceDueReminders', () => {
  it('retire tous les rappels en attente de l’entrée, et d’elle seule, puis programme les nouveaux', async () => {
    seed(
      `treatment:${ID}:2026-09-20:due`,
      `treatment:${ID}:2026-10-20:overdue`,
      `treatment:${OTHER}:2026-09-20:due`,
    )

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [DUE])

    expect([...notifications.pending.keys()].sort()).toEqual(
      [`treatment:${OTHER}:2026-09-20:due`, DUE.key].sort(),
    )
    expect(notifications.cancelReminder.mock.invocationCallOrder.at(-1)).toBeLessThan(
      notifications.scheduleReminder.mock.invocationCallOrder[0]!,
    )
  })

  it('ne programme rien sans permission et ne construit pas les rappels', async () => {
    notifications.checkPermission.mockResolvedValue(false)
    const build = vi.fn<() => Reminder[]>(() => [DUE])

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, build)

    expect(build).not.toHaveBeenCalled()
    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
  })

  it('ne dépasse pas le plafond de rappels en attente, en gardant les plus proches', async () => {
    seed(...Array.from({ length: MAX_SCHEDULED_REMINDERS - 1 }, (_, i) => `vaccination:${i}:x:due`))
    seed(`treatment:${ID}:2026-09-20:due`)
    const before = reminder(`treatment:${ID}:2026-10-15:before`, new Date(2026, 9, 12, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [DUE, before])

    expect(notifications.scheduleReminder.mock.calls).toEqual([[before]])
    expect(notifications.pending.size).toBe(MAX_SCHEDULED_REMINDERS)
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.scheduleReminder.mockRejectedValue(new Error('plugin'))

    await expect(
      replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [DUE]),
    ).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('cancelDueReminders', () => {
  it('retire tous les rappels de chaque entrée, même sans permission', async () => {
    notifications.checkPermission.mockResolvedValue(false)
    seed(
      `vaccination:${ID}:2026-10-15:before`,
      `treatment:${OTHER}:2026-09-20:due`,
      `treatment:${OTHER}:2026-09-27:due`,
      `treatment:${ID}:2026-09-20:due`,
    )

    await cancelDueReminders(notifications, [
      { kind: 'vaccination', id: ID },
      { kind: 'treatment', id: OTHER },
    ])

    expect([...notifications.pending.keys()]).toEqual([`treatment:${ID}:2026-09-20:due`])
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.listScheduled.mockRejectedValue(new Error('plugin'))

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
    seed(`treatment:${OTHER}:2026-09-20:due`)
    const replacing = replaceDueReminders(
      notifications,
      { kind: 'treatment', id: ID },
      async () => {
        await blocked
        return [DUE]
      },
    )
    const cancelling = cancelDueReminders(notifications, [{ kind: 'treatment', id: OTHER }])
    const synced = vi.fn<() => Promise<void>>().mockResolvedValue()
    const syncing = enqueueReminderTask(synced)

    await vi.waitFor(() => expect(notifications.checkPermission).toHaveBeenCalled())
    expect(notifications.cancelReminder).not.toHaveBeenCalled()
    expect(synced).not.toHaveBeenCalled()

    release()
    await Promise.all([replacing, cancelling, syncing])

    expect(notifications.scheduleReminder.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.cancelReminder.mock.invocationCallOrder[0]!,
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
