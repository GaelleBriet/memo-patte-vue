// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Reminder } from '@/core/notifications'
import {
  cancelDueReminders,
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  provideFullReminderSync,
  notedDeliveredIds,
  remindersWithinCap,
  replaceDueReminders,
  type EntryReminders,
} from '../domain/due-reminders-schedule'
import { createFakeNotifications, type FakeNotifications } from './fake-notifications'

const ID = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

function reminder(key: string, at = new Date(2026, 9, 15, 9)): Reminder {
  return { key, title: 'titre', body: 'corps', at }
}

const DUE = reminder(`treatment:${ID}:2026-10-15:due`)

function planned(reminders: Reminder[], isNoted = (_dueDate: string) => false): EntryReminders {
  return { reminders, isNoted }
}

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

describe('remindersWithinCap', () => {
  it('réserve la première échéance à venir de chaque entrée, jamais une suivante', () => {
    const first = reminder(`treatment:${ID}:2026-11-10:due`, new Date(2026, 10, 10, 9))
    const second = reminder(`treatment:${ID}:2026-12-10:due`, new Date(2026, 11, 10, 9))
    const others = Array.from({ length: 5 }, (_, index) =>
      reminder(`vaccination:${index}:2026-09-20:due`, new Date(2026, 8, 20 + index, 9)),
    )

    const kept = remindersWithinCap([first, second, ...others], others.length + 1)

    expect(kept.map(({ key }) => key)).toContain(first.key)
    expect(kept.map(({ key }) => key)).not.toContain(second.key)
  })

  it('remplit la place restante par les rappels les plus proches', () => {
    const due = reminder(`treatment:${ID}:2026-12-10:due`, new Date(2026, 11, 10, 9))
    const near = reminder(`treatment:${ID}:2026-12-10:before`, new Date(2026, 11, 7, 9))
    const far = reminder(`treatment:${ID}:2026-12-10:overdue`, new Date(2026, 11, 13, 9))

    expect(remindersWithinCap([far, due, near], 2)).toEqual([near, due])
  })
})

describe('replaceDueReminders', () => {
  it('retire tous les rappels en attente de l’entrée, et d’elle seule, puis programme les nouveaux', async () => {
    seed(
      `treatment:${ID}:2026-09-20:due`,
      `treatment:${ID}:2026-10-20:overdue`,
      `treatment:${OTHER}:2026-09-20:due`,
    )

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => planned([DUE]))

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

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE, before]),
    )

    expect(notifications.scheduleReminders).toHaveBeenCalledOnce()
    expect(notifications.scheduleReminders.mock.calls[0]![0]).toEqual([before, DUE])
  })

  it('ne programme rien sans permission et ne construit pas les rappels', async () => {
    notifications.checkPermission.mockResolvedValue(false)
    const build = vi.fn<() => EntryReminders>(() => planned([DUE]))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, build)

    expect(build).not.toHaveBeenCalled()
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it('ne dépasse pas le plafond de rappels en attente, en gardant le jour de l’échéance', async () => {
    seed(...Array.from({ length: MAX_SCHEDULED_REMINDERS - 1 }, (_, i) => `vaccination:${i}:x:due`))
    seed(`treatment:${ID}:2026-09-20:due`)
    const before = reminder(`treatment:${ID}:2026-10-15:before`, new Date(2026, 9, 12, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE, before]),
    )

    expect(notifications.scheduleReminders.mock.calls).toEqual([[[DUE]]])
    expect(notifications.pending.size).toBe(MAX_SCHEDULED_REMINDERS)
  })

  it('ne compte pas dans le plafond les rappels en attente déjà passés', async () => {
    seedMany(MAX_SCHEDULED_REMINDERS, new Date(2020, 0, 1, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => planned([DUE]))

    expect(notifications.scheduleReminders.mock.calls).toEqual([[[DUE]]])
  })

  it('demande une synchro complète quand le plafond écarte un rappel plus proche que les programmés', async () => {
    const fullSync = vi.fn<() => Promise<void>>().mockResolvedValue()
    provideFullReminderSync(fullSync)
    seedMany(MAX_SCHEDULED_REMINDERS, new Date(2099, 0, 1, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => planned([DUE]))

    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
    expect(fullSync).toHaveBeenCalledOnce()
  })

  it('demande une synchro complète pour un rappel écarté plus proche que ceux en attente, même programmé plus tard', async () => {
    const fullSync = vi.fn<() => Promise<void>>().mockResolvedValue()
    provideFullReminderSync(fullSync)
    seedMany(MAX_SCHEDULED_REMINDERS - 1, new Date(2026, 9, 14, 9))
    const before = reminder(`treatment:${ID}:2026-10-15:before`, new Date(2026, 9, 12, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE, before]),
    )

    expect(notifications.scheduleReminders.mock.calls).toEqual([[[DUE]]])
    expect(fullSync).toHaveBeenCalledOnce()
  })

  it('ne demande pas de synchro complète quand le rappel écarté est plus lointain que les programmés', async () => {
    const fullSync = vi.fn<() => Promise<void>>().mockResolvedValue()
    provideFullReminderSync(fullSync)
    seedMany(MAX_SCHEDULED_REMINDERS, new Date(2099, 0, 1, 9))
    const farther = reminder(`treatment:${ID}:2100-01-01:due`, new Date(2100, 0, 1, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([farther]),
    )

    expect(fullSync).not.toHaveBeenCalled()
  })

  it('retire du volet les notifications déjà affichées d’une échéance notée, et d’elle seule', async () => {
    const past = new Date(2020, 0, 1, 9)
    const shown = reminder(`treatment:${ID}:2020-01-01:due`, past)
    const shownBefore = reminder(`treatment:${ID}:2020-01-01:before`, past)
    const stillAwaited = reminder(`treatment:${ID}:2019-12-01:overdue`, past)
    const otherEntry = reminder(`treatment:${OTHER}:2020-01-01:due`, past)
    for (const seeded of [shown, shownBefore, stillAwaited, otherEntry]) {
      notifications.pending.set(seeded.key, seeded)
    }

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE], (dueDate) => dueDate === '2020-01-01'),
    )

    expect(notifications.removeDelivered).toHaveBeenCalledExactlyOnceWith([
      notifications.idOf(shown.key),
      notifications.idOf(shownBefore.key),
    ])
  })

  it('ne retire rien du volet quand aucune échéance affichée n’est notée', async () => {
    const shown = reminder(`treatment:${ID}:2020-01-01:due`, new Date(2020, 0, 1, 9))
    notifications.pending.set(shown.key, shown)

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => planned([DUE]))

    expect(notifications.removeDelivered).not.toHaveBeenCalled()
  })

  it('ne retire jamais du volet un rappel encore à venir', async () => {
    seed(`treatment:${ID}:2026-10-15:before`)

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE], () => true),
    )

    expect(notifications.removeDelivered).not.toHaveBeenCalled()
  })

  it('programme quand même quand le volet ne se laisse pas vider', async () => {
    const shown = reminder(`treatment:${ID}:2020-01-01:due`, new Date(2020, 0, 1, 9))
    notifications.pending.set(shown.key, shown)
    notifications.removeDelivered.mockRejectedValue(new Error('plugin'))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE], () => true),
    )

    expect(notifications.scheduleReminders).toHaveBeenCalledExactlyOnceWith([DUE])
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.scheduleReminders.mockRejectedValue(new Error('plugin'))

    await expect(
      replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => planned([DUE])),
    ).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('notedDeliveredIds', () => {
  const NOW = new Date(2026, 8, 25, 12).getTime()

  function scheduled(id: number, key: string | undefined, at: Date | undefined) {
    return { id, key, title: 'titre', body: 'corps', at }
  }

  it('désigne les notifications déjà affichées dont l’entrée tient l’échéance pour notée', () => {
    const list = [
      scheduled(1, `treatment:${ID}:2026-09-25:due`, new Date(2026, 8, 25, 9)),
      scheduled(2, `vaccination:${OTHER}:2026-09-22:overdue`, new Date(2026, 8, 25, 9)),
      scheduled(3, `treatment:${ID}:2026-10-25:before`, new Date(2026, 9, 22, 9)),
      scheduled(4, undefined, new Date(2026, 8, 20, 9)),
      scheduled(5, 'weight:3', new Date(2026, 8, 20, 9)),
    ]
    const noted = vi.fn<(entry: string, dueDate: string) => boolean>(
      (entry) => entry === `treatment:${ID}`,
    )

    expect(notedDeliveredIds(list, noted, NOW)).toEqual([1])
    expect(noted).toHaveBeenCalledWith(`treatment:${ID}`, '2026-09-25')
    expect(noted).toHaveBeenCalledWith(`vaccination:${OTHER}`, '2026-09-22')
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
        return planned([DUE])
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
