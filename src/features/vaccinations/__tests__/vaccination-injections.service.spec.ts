// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

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

  describe('historique', () => {
    async function noter(injectedOn: string, nextDueDate: string | null): Promise<string> {
      return (await service.record(carre, { injectedOn, nextDueDate })).injectionId
    }

    it('supprime la dernière injection : le rappel choisi à la précédente revient', async () => {
      const derniere = await noter('2026-09-23', '2027-09-23')

      await service.remove(carre, derniere)

      await expect(vaccinations.getById(carre)).resolves.toMatchObject({
        lastInjectionDate: '2025-09-26',
        dueDate: '2026-09-26',
      })
      expect(dueDates()).toEqual(['2026-09-26'])
    })

    it('refuse de supprimer la seule injection d’un vaccin', async () => {
      await expect(service.remove(carre, carre)).rejects.toThrow('Injection non supprimée')

      await expect(vaccinations.getById(carre)).resolves.not.toBeNull()
      expect(dueDates()).toEqual(['2026-09-26'])
    })

    it('rétablit une injection supprimée et son rappel (Annuler)', async () => {
      const derniere = await noter('2026-09-23', '2027-09-23')
      await service.remove(carre, derniere)

      await service.undoRemove(carre, derniere)

      await expect(vaccinations.getById(carre)).resolves.toMatchObject({ dueDate: '2027-09-23' })
      expect(dueDates()).toEqual(['2027-09-23'])
    })

    it('change la date de la dernière injection : un rappel à un an la suit', async () => {
      const derniere = await noter('2026-09-23', '2027-09-23')

      const avant = await service.changeDate(carre, derniere, '2026-09-20')

      expect(avant).toEqual({ injectedOn: '2026-09-23', nextDueDate: '2027-09-23' })
      await expect(vaccinations.getById(carre)).resolves.toMatchObject({
        lastInjectionDate: '2026-09-20',
        dueDate: '2027-09-20',
      })
      expect(dueDates()).toEqual(['2027-09-20'])
    })

    it('une injection ancienne déplacée après la dernière devient la tête', async () => {
      await noter('2026-06-01', '2026-12-01')

      await service.changeDate(carre, carre, '2026-09-01')

      await expect(vaccinations.getById(carre)).resolves.toMatchObject({
        lastInjectionDate: '2026-09-01',
        dueDate: '2027-09-01',
      })
    })

    it('remet les dates d’avant le changement (Annuler)', async () => {
      const derniere = await noter('2026-09-23', '2026-12-01')
      const avant = await service.changeDate(carre, derniere, '2026-09-20')

      await service.undoChangeDate(carre, derniere, avant)

      await expect(vaccinations.getById(carre)).resolves.toMatchObject({
        lastInjectionDate: '2026-09-23',
        dueDate: '2026-12-01',
      })
      expect(dueDates()).toEqual(['2026-12-01'])
    })

    it('refuse une date future, sans rien écrire', async () => {
      await expect(service.changeDate(carre, carre, '2026-09-24')).rejects.toThrow(ZodError)

      await expect(vaccinations.getById(carre)).resolves.toMatchObject({
        lastInjectionDate: '2025-09-26',
      })
    })
  })

  it('dit l’échec d’une annulation qui n’a rien supprimé', async () => {
    const { injectionId } = await service.record(carre, {
      injectedOn: '2026-09-23',
      nextDueDate: '2027-09-23',
    })
    await service.remove(carre, carre)

    await expect(service.undo(carre, injectionId)).rejects.toThrow('Injection non annulée')

    await expect(vaccinations.getById(carre)).resolves.toMatchObject({ dueDate: '2027-09-23' })
  })

  it('refuse une injection future, sans rien écrire', async () => {
    await expect(
      service.record(carre, { injectedOn: '2026-09-24', nextDueDate: null }),
    ).rejects.toThrow(ZodError)

    await expect(vaccinations.getById(carre)).resolves.toMatchObject({
      lastInjectionDate: '2025-09-26',
    })
  })
})
