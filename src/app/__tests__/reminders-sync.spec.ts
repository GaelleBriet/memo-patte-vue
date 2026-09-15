import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/animal.schema'
import type { Treatment } from '@/features/treatments/treatment.schema'
import type { Vaccination } from '@/features/vaccinations/vaccination.schema'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
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
})

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
      [`vaccination:${chppi.id}:before`, 'Vaccin CHPPi de Milo dans 3 jours'],
      [`vaccination:${chppi.id}:due`, 'Vaccin CHPPi de Milo aujourd’hui'],
      [`treatment:${MILBEMAX.id}:due`, 'Vermifuge Milbemax de Luna aujourd’hui'],
    ])
  })

  it('ignore les entrées dont l’animal n’est plus en base', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', GONE, '2026-10-15'),
    ])

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledWith([])
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
  it('synchronise au démarrage puis à chaque retour au premier plan', () => {
    const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()

    const uninstall = installRemindersSync(syncAll)
    expect(syncAll).toHaveBeenCalledTimes(1)

    simulateWebResume()
    expect(syncAll).toHaveBeenCalledTimes(2)

    uninstall()
    simulateWebResume()
    expect(syncAll).toHaveBeenCalledTimes(2)
  })
})
