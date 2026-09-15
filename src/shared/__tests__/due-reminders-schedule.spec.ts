// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Reminder } from '@/core/notifications'
import {
  cancelDueReminders,
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  provideFullReminderSync,
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
  provideFullReminderSync(null)
})

function seed(...keys: string[]): void {
  for (const key of keys) notifications.pending.set(key, reminder(key))
}

function seedMany(count: number, at: Date): void {
  for (let index = 0; index < count; index += 1) {
    const key = `vaccination:${index}:x:due`
    notifications.pending.set(key, reminder(key, at))
  }
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
    expect(notifications.cancelReminders.mock.calls).toEqual([
      [[`treatment:${ID}:2026-09-20:due`, `treatment:${ID}:2026-10-20:overdue`]],
    ])
    expect(notifications.cancelReminders.mock.invocationCallOrder.at(-1)).toBeLessThan(
      notifications.scheduleReminders.mock.invocationCallOrder[0]!,
    )
  })

  it('programme tous les nouveaux rappels de l’entrée en un seul appel', async () => {
    const before = reminder(`treatment:${ID}:2026-10-15:before`, new Date(2026, 9, 12, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [DUE, before])

    expect(notifications.scheduleReminders).toHaveBeenCalledOnce()
    expect(notifications.scheduleReminders.mock.calls[0]![0]).toEqual([before, DUE])
  })

  it('ne programme rien sans permission et ne construit pas les rappels', async () => {
    notifications.checkPermission.mockResolvedValue(false)
    const build = vi.fn<() => Reminder[]>(() => [DUE])

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, build)

    expect(build).not.toHaveBeenCalled()
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it('ne dépasse pas le plafond de rappels en attente, en gardant le jour de l’échéance', async () => {
    seed(...Array.from({ length: MAX_SCHEDULED_REMINDERS - 1 }, (_, i) => `vaccination:${i}:x:due`))
    seed(`treatment:${ID}:2026-09-20:due`)
    const before = reminder(`treatment:${ID}:2026-10-15:before`, new Date(2026, 9, 12, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [DUE, before])

    expect(notifications.scheduleReminders.mock.calls).toEqual([[[DUE]]])
    expect(notifications.pending.size).toBe(MAX_SCHEDULED_REMINDERS)
  })

  it('ne compte pas dans le plafond les rappels en attente déjà passés', async () => {
    seedMany(MAX_SCHEDULED_REMINDERS, new Date(2020, 0, 1, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [DUE])

    expect(notifications.scheduleReminders.mock.calls).toEqual([[[DUE]]])
  })

  it('demande une synchro complète quand le plafond écarte un rappel plus proche que les programmés', async () => {
    const fullSync = vi.fn<() => Promise<void>>().mockResolvedValue()
    provideFullReminderSync(fullSync)
    seedMany(MAX_SCHEDULED_REMINDERS, new Date(2099, 0, 1, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [DUE])

    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
    expect(fullSync).toHaveBeenCalledOnce()
  })

  it('ne demande pas de synchro complète quand le rappel écarté est plus lointain que les programmés', async () => {
    const fullSync = vi.fn<() => Promise<void>>().mockResolvedValue()
    provideFullReminderSync(fullSync)
    seedMany(MAX_SCHEDULED_REMINDERS, new Date(2099, 0, 1, 9))
    const farther = reminder(`treatment:${ID}:2100-01-01:due`, new Date(2100, 0, 1, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [farther])

    expect(fullSync).not.toHaveBeenCalled()
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.scheduleReminders.mockRejectedValue(new Error('plugin'))

    await expect(
      replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => [DUE]),
    ).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('cancelDueReminders', () => {
  it('retire en un seul appel tous les rappels de chaque entrée, même sans permission', async () => {
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
    expect(notifications.cancelReminders).toHaveBeenCalledOnce()
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
    expect(notifications.cancelReminders).not.toHaveBeenCalled()
    expect(synced).not.toHaveBeenCalled()

    release()
    await Promise.all([replacing, cancelling, syncing])

    expect(notifications.scheduleReminders.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.cancelReminders.mock.invocationCallOrder[0]!,
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
