import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import { createAnimalsRepository } from '@/features/animals/animals.repository'
import { createTreatmentsRepository } from '@/features/treatments/treatments.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/vaccinations.repository'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import { enqueueReminderTask, MAX_SCHEDULED_REMINDERS } from '@/shared/due-reminders-schedule'
import { createRemindersSync, installRemindersSync } from '../reminders-sync'

const NOW = new Date(2026, 8, 15, 12)

let db: InMemoryDb
let repositories: ReturnType<typeof createRepositories>
let notifications: FakeNotifications
let uninstall: (() => void) | null = null

function createRepositories(client: InMemoryDb) {
  return {
    animals: createAnimalsRepository(client),
    vaccinations: createVaccinationsRepository(client),
    treatments: createTreatmentsRepository(client),
  }
}

/** Synchro branchée sur la base restaurée : aucun état ne survit d'avant la restauration. */
function restoredDevice() {
  return createRemindersSync({
    animals: () => repositories.animals,
    vaccinations: () => repositories.vaccinations,
    treatments: () => repositories.treatments,
    notifications,
    t: i18n.global.t,
    now: () => NOW,
  })
}

function scheduledKeys(): string[] {
  return [...notifications.pending.values()]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ key }) => key)
}

function settled(): Promise<void> {
  return enqueueReminderTask(async () => {})
}

async function seedAnimal(name: string, species: 'dog' | 'cat') {
  return repositories.animals.create({ name, species })
}

beforeEach(async () => {
  db = await createInMemoryDb()
  vi.useFakeTimers({ now: NOW })
  repositories = createRepositories(db)
  notifications = createFakeNotifications()
  setActivePinia(createPinia())
})

afterEach(() => {
  uninstall?.()
  uninstall = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  db.close()
})

describe('appareil restauré, aucune notification programmée', () => {
  it('reprogramme en un bloc tous les rappels du carnet restauré', async () => {
    const milo = await seedAnimal('Milo', 'dog')
    const luna = await seedAnimal('Luna', 'cat')
    const chppi = await repositories.vaccinations.create({
      animalId: milo.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-10-15',
      dueDate: '2026-10-15',
    })
    await repositories.vaccinations.create({
      animalId: milo.id,
      name: 'Rage',
      lastInjectionDate: '2025-10-15',
    })
    const milbemax = await repositories.treatments.create({
      animalId: luna.id,
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-06-17',
    })

    await restoredDevice()()

    expect(scheduledKeys()).toEqual([
      `treatment:${milbemax.id}:2026-09-17:due`,
      `treatment:${milbemax.id}:2026-09-17:overdue`,
      `vaccination:${chppi.id}:2026-10-15:before`,
      `vaccination:${chppi.id}:2026-10-15:due`,
      `vaccination:${chppi.id}:2026-10-15:overdue`,
    ])
    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it('ne programme rien sans permission, et reconstruit tout dès qu’elle est accordée', async () => {
    const milo = await seedAnimal('Milo', 'dog')
    const chppi = await repositories.vaccinations.create({
      animalId: milo.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-10-15',
      dueDate: '2026-10-15',
    })
    notifications.checkPermission.mockResolvedValue(false)
    const granted = new Set<() => void>()

    uninstall = installRemindersSync(restoredDevice(), (listener) => {
      granted.add(listener)
      return () => granted.delete(listener)
    })
    await settled()
    expect(notifications.pending.size).toBe(0)

    notifications.checkPermission.mockResolvedValue(true)
    for (const listener of granted) listener()
    await settled()

    expect(scheduledKeys()).toEqual([
      `vaccination:${chppi.id}:2026-10-15:before`,
      `vaccination:${chppi.id}:2026-10-15:due`,
      `vaccination:${chppi.id}:2026-10-15:overdue`,
    ])
  })

  it('ne reprogramme rien au retour au premier plan : ni doublon, ni rappel perdu', async () => {
    const milo = await seedAnimal('Milo', 'dog')
    await repositories.vaccinations.create({
      animalId: milo.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-10-15',
      dueDate: '2026-10-15',
    })

    uninstall = installRemindersSync(restoredDevice(), () => () => {})
    await settled()
    const afterLaunch = scheduledKeys()

    simulateWebResume()
    await settled()
    simulateWebResume()
    await settled()

    expect(scheduledKeys()).toEqual(afterLaunch)
    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
  })

  it('reprogramme au retour au premier plan quand le système a perdu les alarmes', async () => {
    const milo = await seedAnimal('Milo', 'dog')
    await repositories.vaccinations.create({
      animalId: milo.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-10-15',
      dueDate: '2026-10-15',
    })

    uninstall = installRemindersSync(restoredDevice(), () => () => {})
    await settled()
    const afterLaunch = scheduledKeys()
    notifications.pending.clear()

    simulateWebResume()
    await settled()

    expect(scheduledKeys()).toEqual(afterLaunch)
  })

  it('ne dépasse pas le plafond d’alarmes quand le carnet restauré est volumineux', async () => {
    const milo = await seedAnimal('Milo', 'dog')
    const count = Math.ceil(MAX_SCHEDULED_REMINDERS / 3) + 10
    for (let index = 0; index < count; index += 1) {
      await repositories.vaccinations.create({
        animalId: milo.id,
        name: `Vaccin ${index}`,
        lastInjectionDate: '2025-10-15',
        dueDate: '2026-10-15',
      })
    }

    await restoredDevice()()
    await restoredDevice()()

    const keys = scheduledKeys()
    expect(keys).toHaveLength(MAX_SCHEDULED_REMINDERS)
    expect(new Set(keys).size).toBe(MAX_SCHEDULED_REMINDERS)
  })

  it('ne ressuscite pas les échéances déjà passées, et garde leurs relances à venir', async () => {
    const milo = await seedAnimal('Milo', 'dog')
    await repositories.vaccinations.create({
      animalId: milo.id,
      name: 'Rage',
      lastInjectionDate: '2025-08-01',
      dueDate: '2026-08-01',
    })
    const chppi = await repositories.vaccinations.create({
      animalId: milo.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-09-14',
      dueDate: '2026-09-14',
    })

    await restoredDevice()()

    expect(scheduledKeys()).toEqual([`vaccination:${chppi.id}:2026-09-14:overdue`])
    expect([...notifications.pending.values()].every(({ at }) => at > NOW)).toBe(true)
  })

  it('reprend les cycles à venir d’un traitement récurrent dont l’échéance notée est périmée', async () => {
    const luna = await seedAnimal('Luna', 'cat')
    const milbemax = await repositories.treatments.create({
      animalId: luna.id,
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 1, unit: 'month' },
      lastDoseDate: '2026-01-10',
    })
    expect(milbemax.nextDueDate).toBe('2026-02-10')

    await restoredDevice()()

    expect(scheduledKeys()).toEqual([
      `treatment:${milbemax.id}:2026-10-10:before`,
      `treatment:${milbemax.id}:2026-10-10:due`,
      `treatment:${milbemax.id}:2026-10-10:overdue`,
      `treatment:${milbemax.id}:2026-11-10:before`,
      `treatment:${milbemax.id}:2026-11-10:due`,
      `treatment:${milbemax.id}:2026-11-10:overdue`,
    ])
  })

  it('ne programme rien quand aucun vaccin restauré n’a d’échéance', async () => {
    const milo = await seedAnimal('Milo', 'dog')
    await repositories.vaccinations.create({
      animalId: milo.id,
      name: 'Rage',
      lastInjectionDate: '2026-08-01',
    })

    await restoredDevice()()

    expect(notifications.pending.size).toBe(0)
    expect(notifications.listScheduled).toHaveBeenCalled()
  })

  it('ne programme rien sur une base restaurée vide', async () => {
    await expect(restoredDevice()()).resolves.toBeUndefined()

    expect(notifications.pending.size).toBe(0)
    expect(notifications.listScheduled).toHaveBeenCalled()
  })
})
