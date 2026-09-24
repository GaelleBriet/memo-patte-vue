// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import { createVaccinationInjectionsRepository } from '../repository/vaccination-injections.repository'
import {
  createVaccinationsRepository,
  type VaccinationsRepository,
} from '../repository/vaccinations.repository'
import {
  createVaccinationInjectionsService,
  type VaccinationInjectionsService,
} from '../service/vaccination-injections.service'
import { createVaccinationRemindersService } from '../service/vaccination-reminders.service'

const BOREE = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-23T08:00:00.000Z')

describe('vaccinationInjectionsService', () => {
  let db: InMemoryDb
  let vaccinations: VaccinationsRepository
  let notifications: FakeNotifications
  let service: VaccinationInjectionsService
  let carre: string

  function dueDates(): string[] {
    return [...notifications.pending.keys()]
      .filter((key) => key.endsWith(':due'))
      .map((key) => key.split(':')[2]!)
  }

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, 'Boree', 'dog', ?, ?)`,
      [BOREE, NOW.toISOString(), NOW.toISOString()],
    )
    vaccinations = createVaccinationsRepository(db)
    notifications = createFakeNotifications()
    const reminders = createVaccinationRemindersService({
      vaccinations: () => vaccinations,
      animals: () => createAnimalsRepository(db),
      notifications,
      t: i18n.global.t,
      now: () => new Date(),
    })
    service = createVaccinationInjectionsService({
      vaccinations: () => vaccinations,
      injections: () => createVaccinationInjectionsRepository(db),
      reminders,
      now: () => new Date(),
    })
    carre = (
      await vaccinations.create({
        animalId: BOREE,
        name: 'Carré',
        lastInjectionDate: '2025-09-26',
        dueDate: '2026-09-26',
      })
    ).id
    await reminders.reschedule(carre)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('note l’injection avec le rappel choisi : nouvelle tête, rappels reprogrammés', async () => {
    expect(dueDates()).toEqual(['2026-09-26'])

    const recorded = await service.record(carre, {
      injectedOn: '2026-09-23',
      nextDueDate: '2027-09-23',
    })

    expect(recorded).toEqual({ animalId: BOREE, injectionId: expect.any(String) })
    await expect(vaccinations.getById(carre)).resolves.toMatchObject({
      lastInjectionDate: '2026-09-23',
      dueDate: '2027-09-23',
    })
    expect(dueDates()).toEqual(['2027-09-23'])
  })

  it('note une injection sans rappel : plus aucun rappel programmé', async () => {
    await service.record(carre, { injectedOn: '2026-09-23', nextDueDate: null })

    await expect(vaccinations.getById(carre)).resolves.toMatchObject({ dueDate: null })
    expect(notifications.pending.size).toBe(0)
  })

  it('annule l’injection : le rappel choisi à la précédente revient', async () => {
    const { injectionId } = await service.record(carre, {
      injectedOn: '2026-09-23',
      nextDueDate: '2029-09-23',
    })

    await service.undo(carre, injectionId)

    await expect(vaccinations.getById(carre)).resolves.toMatchObject({
      lastInjectionDate: '2025-09-26',
      dueDate: '2026-09-26',
    })
    expect(dueDates()).toEqual(['2026-09-26'])
  })

  it('refuse une injection future, sans rien écrire', async () => {
    await expect(
      service.record(carre, { injectedOn: '2026-09-24', nextDueDate: null }),
    ).rejects.toThrow()

    await expect(vaccinations.getById(carre)).resolves.toMatchObject({
      lastInjectionDate: '2025-09-26',
    })
  })
})
