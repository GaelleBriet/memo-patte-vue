// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Reminder } from '@/core/notifications'
import {
  cancelAllDueReminders,
  cancelDueReminders,
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  provideFullReminderSync,
  carnetReminderSettings,
  notedDeliveredIds,
  provideCarnetReminderSettings,
  replaceDueReminders,
  isRebuildRequested,
  markRebuilt,
  withdrawDueReminders,
  type EntryReminders,
} from '../due-reminders-schedule'
import {
  MAX_REMINDERS_PER_CARE,
  type CareReminders,
  type CarnetReminderSettings,
} from '@/shared/domain/reminder-plan'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'

const ID = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

function reminder(key: string, at = new Date(2026, 9, 15, 9)): Reminder {
  return { key, title: 'titre', body: 'corps', at }
}

const DUE = reminder(`treatment:${ID}:2026-10-15:due`)

const RELAY = 'Pour continuer à recevoir les rappels de Luna, ouvre MémoPatte.'

function care(reminders: Reminder[], complete = true): CareReminders {
  return { entry: { kind: 'treatment', id: ID }, reminders, complete, relay: RELAY }
}

function planned(
  reminders: Reminder[],
  isNoted = (_dueDate: string, _dueTime: string | null) => false,
): EntryReminders {
  return { care: care(reminders), isNoted }
}

let notifications: FakeNotifications

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 25, 8) })
  notifications = createFakeNotifications()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  provideFullReminderSync(null)
  provideCarnetReminderSettings(null)
  markRebuilt()
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
  it('programmer avant d’annuler garde l’appareil sous les 500 alarmes qui font planter Android', () => {
    expect(MAX_SCHEDULED_REMINDERS + MAX_REMINDERS_PER_CARE).toBeLessThan(500)
  })

  it('programme les nouveaux rappels, puis retire les anciens de l’entrée, et d’elle seule', async () => {
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
    expect(notifications.scheduleReminders.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.cancelReminders.mock.invocationCallOrder[0]!,
    )
  })

  it('n’annule pas un rappel reprogrammé sous la même clé', async () => {
    seed(DUE.key)

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => planned([DUE]))

    expect(notifications.cancelReminders).not.toHaveBeenCalled()
    expect([...notifications.pending.keys()]).toEqual([DUE.key])
  })

  it('annule les rappels restés sous l’ancienne clé sans heure', async () => {
    const legacy = `treatment:${ID}:2026-10-15:due`
    const withTime = reminder(`treatment:${ID}:2026-10-15:2000:due`, new Date(2026, 9, 15, 20))
    seed(legacy)

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([withTime]),
    )

    expect([...notifications.pending.keys()]).toEqual([withTime.key])
  })

  it('ajoute le relais au dernier rappel d’un soin dont la suite n’est pas programmée', async () => {
    const before = reminder(`treatment:${ID}:2026-10-15:before`, new Date(2026, 9, 12, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => ({
      care: care([before, DUE], false),
      isNoted: () => false,
    }))

    expect(notifications.scheduleReminders.mock.calls[0]![0].map(({ body }) => body)).toEqual([
      'corps',
      `corps\n${RELAY}`,
    ])
  })

  it('retire tous les rappels de l’entrée quand elle n’a plus de soin', async () => {
    seed(`treatment:${ID}:2026-09-20:due`, `treatment:${OTHER}:2026-09-20:due`)

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => ({
      care: null,
      isNoted: () => false,
    }))

    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
    expect([...notifications.pending.keys()]).toEqual([`treatment:${OTHER}:2026-09-20:due`])
  })

  it('garde les anciens rappels quand la construction des nouveaux échoue', async () => {
    seed(`treatment:${ID}:2026-09-20:due`)

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => {
      throw new Error('base indisponible')
    })

    expect([...notifications.pending.keys()]).toEqual([`treatment:${ID}:2026-09-20:due`])
    expect(notifications.cancelReminders).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('rejoue une fois la programmation ratée, puis retire les anciens', async () => {
    seed(`treatment:${ID}:2026-09-20:due`)
    notifications.scheduleReminders.mockRejectedValueOnce(new Error('plugin'))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => planned([DUE]))

    expect(notifications.scheduleReminders).toHaveBeenCalledTimes(2)
    expect([...notifications.pending.keys()]).toEqual([DUE.key])
    expect(isRebuildRequested()).toBe(false)
  })

  it('ratée deux fois, garde les anciens rappels et demande de tout reconstruire une fois', async () => {
    seed(`treatment:${ID}:2026-09-20:due`)
    notifications.scheduleReminders.mockRejectedValue(new Error('plugin'))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () => planned([DUE]))

    expect(notifications.scheduleReminders).toHaveBeenCalledTimes(2)
    expect(notifications.cancelReminders).not.toHaveBeenCalled()
    expect([...notifications.pending.keys()]).toEqual([`treatment:${ID}:2026-09-20:due`])
    expect(isRebuildRequested()).toBe(true)
  })

  it('programme tous les nouveaux rappels de l’entrée en un seul appel', async () => {
    const before = reminder(`treatment:${ID}:2026-10-15:before`, new Date(2026, 9, 12, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE, before]),
    )

    expect(notifications.scheduleReminders).toHaveBeenCalledOnce()
    expect(notifications.scheduleReminders.mock.calls[0]![0]).toEqual([before, DUE])
  })

  it('sans permission, ne construit rien et retire les rappels de l’entrée', async () => {
    seed(`treatment:${ID}:2026-09-20:due`)
    notifications.checkPermission.mockResolvedValue(false)
    const build = vi.fn<() => EntryReminders>(() => planned([DUE]))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, build)

    expect(build).not.toHaveBeenCalled()
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
    expect(notifications.pending.size).toBe(0)
  })

  it('ne dépasse pas le plafond de rappels en attente, en gardant le jour de l’échéance', async () => {
    seed(...Array.from({ length: MAX_SCHEDULED_REMINDERS - 1 }, (_, i) => `vaccination:${i}:x:due`))
    seed(`treatment:${ID}:2026-09-20:due`)
    const before = reminder(`treatment:${ID}:2026-10-15:before`, new Date(2026, 9, 12, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE, before]),
    )

    expect(notifications.scheduleReminders.mock.calls).toEqual([
      [[{ ...DUE, body: `corps\n${RELAY}` }]],
    ])
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

    expect(notifications.scheduleReminders.mock.calls).toEqual([
      [[{ ...DUE, body: `corps\n${RELAY}` }]],
    ])
    expect(fullSync).toHaveBeenCalledOnce()
  })

  it('ne demande pas de synchro complète quand le rappel écarté est plus lointain que les programmés', async () => {
    const fullSync = vi.fn<() => Promise<void>>().mockResolvedValue()
    provideFullReminderSync(fullSync)
    seedMany(MAX_SCHEDULED_REMINDERS - 1, new Date(2099, 0, 1, 9))
    const farther = reminder(`treatment:${ID}:2100-01-01:due`, new Date(2100, 0, 1, 9))
    const overdue = reminder(`treatment:${ID}:2100-01-01:overdue`, new Date(2100, 0, 4, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([farther, overdue]),
    )

    expect(notifications.scheduleReminders.mock.calls[0]![0].map(({ key }) => key)).toEqual([
      farther.key,
    ])
    expect(fullSync).not.toHaveBeenCalled()
  })

  it('RA-11 : un soin qui n’a plus aucune place, même lointain, demande une synchro complète', async () => {
    const fullSync = vi.fn<() => Promise<void>>().mockResolvedValue()
    provideFullReminderSync(fullSync)
    seedMany(MAX_SCHEDULED_REMINDERS, new Date(2099, 0, 1, 9))
    const farther = reminder(`treatment:${ID}:2100-01-01:due`, new Date(2100, 0, 1, 9))

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([farther]),
    )

    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
    expect(fullSync).toHaveBeenCalledOnce()
  })

  it('retire du volet les notifications déjà affichées d’une échéance notée, et d’elle seule', async () => {
    const past = new Date(2020, 0, 1, 9)
    const shown = reminder(`treatment:${ID}:2020-01-01:0800:due`, past)
    const shownBefore = reminder(`treatment:${ID}:2020-01-01:0800:before`, past)
    const otherHour = reminder(`treatment:${ID}:2020-01-01:2000:due`, past)
    const stillAwaited = reminder(`treatment:${ID}:2019-12-01:0800:overdue`, past)
    const otherEntry = reminder(`treatment:${OTHER}:2020-01-01:0800:due`, past)
    for (const seeded of [shown, shownBefore, otherHour, stillAwaited, otherEntry]) {
      notifications.pending.set(seeded.key, seeded)
    }

    await replaceDueReminders(notifications, { kind: 'treatment', id: ID }, () =>
      planned([DUE], (dueDate, dueTime) => dueDate === '2020-01-01' && dueTime === '08:00'),
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
    return { id, key, title: 'titre', body: 'corps', at, exact: false }
  }

  it('désigne les notifications déjà affichées dont l’entrée tient l’échéance pour notée', () => {
    const list = [
      scheduled(1, `treatment:${ID}:2026-09-25:due`, new Date(2026, 8, 25, 9)),
      scheduled(2, `vaccination:${OTHER}:2026-09-22::overdue`, new Date(2026, 8, 25, 9)),
      scheduled(6, `treatment:${ID}:2026-09-25:0800:due`, new Date(2026, 8, 25, 8)),
      scheduled(3, `treatment:${ID}:2026-10-25:before`, new Date(2026, 9, 22, 9)),
      scheduled(4, undefined, new Date(2026, 8, 20, 9)),
      scheduled(5, 'weight:3', new Date(2026, 8, 20, 9)),
    ]
    const noted = vi.fn<(entry: string, dueDate: string, dueTime: string | null) => boolean>(
      (entry) => entry === `treatment:${ID}`,
    )

    expect(notedDeliveredIds(list, noted, NOW)).toEqual([1, 6])
    expect(noted).toHaveBeenCalledWith(`treatment:${ID}`, '2026-09-25', null)
    expect(noted).toHaveBeenCalledWith(`vaccination:${OTHER}`, '2026-09-22', null)
    expect(noted).toHaveBeenCalledWith(`treatment:${ID}`, '2026-09-25', '08:00')
  })
})

describe('carnetReminderSettings', () => {
  it('rend les réglages par défaut tant que rien n’est branché', async () => {
    await expect(carnetReminderSettings()).resolves.toEqual({
      vaccineReminderTime: '09:00',
      remindBeforeDue: true,
    })
  })

  it('lit les réglages branchés à chaque appel', async () => {
    const read = vi.fn<() => Promise<CarnetReminderSettings>>(async () => ({
      vaccineReminderTime: '18:30',
      remindBeforeDue: false,
    }))
    provideCarnetReminderSettings(read)

    await expect(carnetReminderSettings()).resolves.toEqual({
      vaccineReminderTime: '18:30',
      remindBeforeDue: false,
    })
    await carnetReminderSettings()
    expect(read).toHaveBeenCalledTimes(2)
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

describe('withdrawDueReminders', () => {
  it('annule les rappels des entrées et retire leurs notifications du volet', async () => {
    notifications.checkPermission.mockResolvedValue(false)
    seed(
      `vaccination:${ID}:2026-09-20:before`,
      `vaccination:${ID}:2026-10-15:before`,
      `treatment:${OTHER}:2026-09-20:due`,
    )
    const shown = notifications.idOf(`vaccination:${ID}:2026-09-20:before`)
    const coming = notifications.idOf(`vaccination:${ID}:2026-10-15:before`)

    await withdrawDueReminders(notifications, [{ kind: 'vaccination', id: ID }])

    expect([...notifications.pending.keys()]).toEqual([`treatment:${OTHER}:2026-09-20:due`])
    expect(notifications.removeDelivered).toHaveBeenCalledWith([shown, coming])
  })

  it('ne touche pas au plugin quand les entrées n’ont aucun rappel', async () => {
    seed(`treatment:${OTHER}:2026-09-20:due`)

    await withdrawDueReminders(notifications, [{ kind: 'vaccination', id: ID }])

    expect(notifications.cancelReminders).not.toHaveBeenCalled()
    expect(notifications.removeDelivered).not.toHaveBeenCalled()
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.listScheduled.mockRejectedValue(new Error('plugin'))

    await expect(
      withdrawDueReminders(notifications, [{ kind: 'treatment', id: ID }]),
    ).resolves.toBeUndefined()
  })
})

describe('cancelAllDueReminders', () => {
  it('annule tout après les reprogrammations déjà en file, jamais avant', async () => {
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const replacing = replaceDueReminders(
      notifications,
      { kind: 'treatment', id: ID },
      async () => {
        await blocked
        return planned([DUE])
      },
    )
    const cancelAllNotifications = vi.fn<() => Promise<void>>().mockResolvedValue()
    const cancelling = cancelAllDueReminders({ cancelAllNotifications })

    await vi.waitFor(() => expect(notifications.checkPermission).toHaveBeenCalled())
    expect(cancelAllNotifications).not.toHaveBeenCalled()

    release()
    await Promise.all([replacing, cancelling])

    expect(notifications.scheduleReminders.mock.invocationCallOrder[0]).toBeLessThan(
      cancelAllNotifications.mock.invocationCallOrder[0]!,
    )
  })

  it('propage un échec du plugin, sans bloquer la file', async () => {
    const cancelAllNotifications = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('plugin'))
    const next = vi.fn<() => Promise<void>>().mockResolvedValue()

    await expect(cancelAllDueReminders({ cancelAllNotifications })).rejects.toThrow('plugin')
    await enqueueReminderTask(next)

    expect(next).toHaveBeenCalledOnce()
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
