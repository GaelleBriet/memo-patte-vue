import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/animal.schema'
import type { AnimalsRepository } from '@/features/animals/animals.repository'
import { provideAnimalsRepository, useAnimalsStore } from '@/features/animals/animals.store'
import type { Treatment } from '@/features/treatments/treatment.schema'
import type { Vaccination } from '@/features/vaccinations/vaccination.schema'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import {
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  replaceDueReminders,
} from '@/shared/due-reminders-schedule'
import type { Reminder } from '@/core/notifications'
import { createRemindersSync, installRemindersSync } from '../reminders-sync'

const STAMP = '2026-09-01T09:00:00.000Z'

function animal(id: string, name: string): Animal {
  return {
    id,
    name,
    species: 'dog',
    breed: null,
    birthDate: null,
    initialWeightKg: null,
    photoPath: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
  }
}

const MILO = animal('11111111-1111-4111-8111-111111111111', 'Milo')
const LUNA = animal('33333333-3333-4333-8333-333333333333', 'Luna')
const GONE = '99999999-9999-4999-8999-999999999999'

function vaccination(id: string, animalId: string, dueDate: string | null): Vaccination {
  return {
    id,
    animalId,
    name: 'CHPPi',
    lastInjectionDate: '2025-10-15',
    dueDate,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
  }
}

const MILBEMAX: Treatment = {
  id: '44444444-4444-4444-8444-444444444444',
  animalId: LUNA.id,
  name: 'Milbemax',
  type: 'deworming',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-09-17',
  nextDueDate: '2026-09-17',
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt: null,
}

let notifications: FakeNotifications
let list: ReturnType<typeof vi.fn<() => Promise<Animal[]>>>
let listVaccinations: ReturnType<typeof vi.fn<() => Promise<Vaccination[]>>>
let listTreatments: ReturnType<typeof vi.fn<() => Promise<Treatment[]>>>

function sync() {
  return createRemindersSync({
    animals: () => ({ list }),
    vaccinations: () => ({ listAll: listVaccinations }),
    treatments: () => ({ listAll: listTreatments }),
    notifications,
    t: i18n.global.t,
    now: () => new Date(2026, 8, 15, 12),
  })
}

beforeEach(() => {
  notifications = createFakeNotifications()
  list = vi.fn<() => Promise<Animal[]>>().mockResolvedValue([MILO, LUNA])
  listVaccinations = vi.fn<() => Promise<Vaccination[]>>().mockResolvedValue([])
  listTreatments = vi.fn<() => Promise<Treatment[]>>().mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
  provideAnimalsRepository(null)
})

const noGrant = () => () => {}

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

describe('syncAllReminders', () => {
  it('reconstruit d’un bloc les rappels de tous les vaccins et traitements en base', async () => {
    const chppi = vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15')
    listVaccinations.mockResolvedValue([
      chppi,
      vaccination('55555555-5555-4555-8555-555555555555', MILO.id, null),
    ])
    listTreatments.mockResolvedValue([MILBEMAX])

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledTimes(1)
    expect(
      notifications.rescheduleAll.mock.calls[0]?.[0].map(({ key, title }) => [key, title]),
    ).toEqual([
      [`treatment:${MILBEMAX.id}:2026-09-17:due`, 'Vermifuge Milbemax de Luna aujourd’hui'],
      [
        `treatment:${MILBEMAX.id}:2026-09-17:overdue`,
        'Vermifuge Milbemax de Luna en retard de 3 jours',
      ],
      [`vaccination:${chppi.id}:2026-10-15:before`, 'Vaccin CHPPi de Milo dans 3 jours'],
      [`vaccination:${chppi.id}:2026-10-15:due`, 'Vaccin CHPPi de Milo aujourd’hui'],
      [`vaccination:${chppi.id}:2026-10-15:overdue`, 'Vaccin CHPPi de Milo en retard de 3 jours'],
    ])
  })

  it('ne touche à rien quand les rappels en attente sont déjà ceux à programmer', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    await sync()()
    notifications.rescheduleAll.mockClear()

    await sync()()

    expect(notifications.rescheduleAll).not.toHaveBeenCalled()
  })

  it('reprogramme quand un texte en attente diffère', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    await sync()()
    notifications.rescheduleAll.mockClear()
    list.mockResolvedValue([{ ...MILO, name: 'Milou' }, LUNA])

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
  })

  it('ignore les entrées dont l’animal n’est plus en base', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', GONE, '2026-10-15'),
    ])
    const stale = 'vaccination:22222222-2222-4222-8222-222222222222:2026-10-15:due'
    notifications.pending.set(stale, { key: stale, title: '', body: '', at: new Date(2026, 9, 15) })

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledWith([])
    expect(notifications.pending.size).toBe(0)
  })

  it('garde au plus 400 rappels, les plus proches d’abord', async () => {
    const count = Math.ceil(MAX_SCHEDULED_REMINDERS / 3) + 1
    listVaccinations.mockResolvedValue(
      Array.from({ length: count }, (_, index) =>
        vaccination(uuid(index), MILO.id, index === 0 ? '2026-11-10' : '2026-10-15'),
      ),
    )

    await sync()()

    const scheduled = notifications.rescheduleAll.mock.calls[0]?.[0] ?? []
    expect(scheduled).toHaveLength(MAX_SCHEDULED_REMINDERS)
    expect(scheduled.map(({ key }) => key)).not.toContain(`vaccination:${uuid(0)}:2026-11-10:due`)
    expect(scheduled.map(({ at }) => at.getTime())).toEqual(
      scheduled.map(({ at }) => at.getTime()).sort((a, b) => a - b),
    )
  })

  it('respecte le plafond avec beaucoup de traitements hebdomadaires, les plus proches d’abord', async () => {
    listTreatments.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        ...MILBEMAX,
        id: uuid(index),
        frequency: { value: 1, unit: 'week' as const },
        nextDueDate: index === 0 ? '2026-11-10' : '2026-09-16',
      })),
    )

    await sync()()

    const scheduled = notifications.rescheduleAll.mock.calls[0]?.[0] ?? []
    expect(scheduled).toHaveLength(MAX_SCHEDULED_REMINDERS)
    const last = Math.max(...scheduled.map(({ at }) => at.getTime()))
    expect(scheduled.some(({ key }) => key.startsWith(`treatment:${uuid(0)}:`))).toBe(false)
    expect(last).toBeLessThan(new Date(2026, 10, 7, 9).getTime())
  })

  it('attend son tour dans la file des opérations de rappel', async () => {
    let release: () => void = () => {}
    const pending = enqueueReminderTask(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    const syncing = sync()()
    await Promise.resolve()
    expect(notifications.checkPermission).not.toHaveBeenCalled()

    release()
    await Promise.all([pending, syncing])
    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
  })

  it('signale deux clés qui tombent sur le même identifiant de notification', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const chppi = vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15')
    listVaccinations.mockResolvedValue([chppi, chppi])

    await sync()()

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('identifiant'),
      expect.stringContaining(`vaccination:${chppi.id}`),
    )
  })

  it('ne fait rien sans permission : ni lecture, ni annulation', async () => {
    notifications.checkPermission.mockResolvedValue(false)

    await sync()()

    expect(list).not.toHaveBeenCalled()
    expect(notifications.rescheduleAll).not.toHaveBeenCalled()
  })

  it('ne lève pas quand la base ou le plugin échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    list.mockRejectedValue(new Error('base indisponible'))

    await expect(sync()()).resolves.toBeUndefined()
    expect(notifications.rescheduleAll).not.toHaveBeenCalled()
  })
})

describe('installRemindersSync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('synchronise tout quand la permission est accordée, jusqu’à la désinstallation', () => {
    const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
    const grantListeners = new Set<() => void>()
    const onGranted = (listener: () => void) => {
      grantListeners.add(listener)
      return () => grantListeners.delete(listener)
    }

    const uninstall = installRemindersSync(syncAll, onGranted)
    syncAll.mockClear()

    for (const listener of grantListeners) listener()
    expect(syncAll).toHaveBeenCalledOnce()

    uninstall()
    expect(grantListeners.size).toBe(0)
  })

  it('branche la synchro complète demandée quand le plafond est atteint', async () => {
    const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
    const uninstall = installRemindersSync(syncAll, noGrant)
    syncAll.mockClear()
    const pending = new Map<string, Reminder>()
    for (let index = 0; index < MAX_SCHEDULED_REMINDERS; index += 1) {
      const key = `vaccination:${index}:x:due`
      pending.set(key, { key, title: '', body: '', at: new Date(2099, 0, 1) })
    }
    notifications.pending.clear()
    for (const [key, value] of pending) notifications.pending.set(key, value)

    await replaceDueReminders(notifications, { kind: 'treatment', id: MILBEMAX.id }, () => [
      {
        key: `treatment:${MILBEMAX.id}:2026-10-15:due`,
        title: '',
        body: '',
        at: new Date(2098, 0, 1),
      },
    ])
    await enqueueReminderTask(async () => {})

    expect(syncAll).toHaveBeenCalledOnce()
    uninstall()
  })

  it('synchronise au démarrage puis à chaque retour au premier plan', () => {
    const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()

    const uninstall = installRemindersSync(syncAll, noGrant)
    expect(syncAll).toHaveBeenCalledTimes(1)

    simulateWebResume()
    expect(syncAll).toHaveBeenCalledTimes(2)

    uninstall()
    simulateWebResume()
    expect(syncAll).toHaveBeenCalledTimes(2)
  })
})

it('resynchronise après la modification d’un animal, pour que son prénom suive', async () => {
  setActivePinia(createPinia())
  const renamed = { ...MILO, name: 'Milou' }
  provideAnimalsRepository(
    () =>
      ({
        getById: async () => MILO,
        update: async () => renamed,
        list: async () => [renamed],
      }) as unknown as AnimalsRepository,
  )
  const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
  const uninstall = installRemindersSync(syncAll, noGrant)
  syncAll.mockClear()

  await useAnimalsStore().update(MILO.id, { name: 'Milou', species: 'dog' })
  expect(syncAll).toHaveBeenCalledOnce()

  uninstall()
  await useAnimalsStore().update(MILO.id, { name: 'Milou', species: 'dog' })
  expect(syncAll).toHaveBeenCalledOnce()
})

it('ne resynchronise pas quand la modification d’un animal échoue', async () => {
  setActivePinia(createPinia())
  provideAnimalsRepository(
    () =>
      ({
        getById: async () => MILO,
        update: async () => {
          throw new Error('base verrouillée')
        },
        list: async () => [MILO],
      }) as unknown as AnimalsRepository,
  )
  const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
  const uninstall = installRemindersSync(syncAll, noGrant)
  syncAll.mockClear()

  await expect(
    useAnimalsStore().update(MILO.id, { name: 'Milou', species: 'dog' }),
  ).rejects.toThrow('base verrouillée')

  expect(syncAll).not.toHaveBeenCalled()
  uninstall()
})
