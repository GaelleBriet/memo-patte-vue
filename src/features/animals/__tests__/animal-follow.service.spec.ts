// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createTreatmentPeriodsRepository,
  type TreatmentPeriodsRepository,
} from '@/features/treatments/repository/treatment-periods.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import type { TreatmentPeriodSettings } from '@/features/treatments/schema/treatment-period.schema'
import { createAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'
import {
  createAnimalFollowService,
  type AnimalFollowService,
} from '../service/animal-follow.service'

const TODAY = '2026-09-28'
const NOW = new Date('2026-09-28T08:00:00.000Z')
const FOLLOWED = { unfollowedOn: null, departureReason: null, departureDate: null }

function settings(overrides: Partial<TreatmentPeriodSettings> = {}): TreatmentPeriodSettings {
  return {
    startsOn: '2026-09-01',
    firstDueOn: '2026-09-01',
    endsOn: null,
    frequency: { value: 1, unit: 'day' },
    times: [],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    ...overrides,
  }
}

describe('animalFollowService', () => {
  let db: InMemoryDb
  let animals: AnimalsRepository
  let treatments: TreatmentsRepository
  let periods: TreatmentPeriodsRepository
  let reminders: {
    withdraw: ReturnType<typeof vi.fn<(animalId: string) => Promise<void>>>
    reschedule: ReturnType<typeof vi.fn<(animalId: string) => Promise<void>>>
  }
  let service: AnimalFollowService

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-01T08:00:00.000Z') })
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    animals = createAnimalsRepository(db)
    treatments = createTreatmentsRepository(db)
    periods = createTreatmentPeriodsRepository(db)
    reminders = {
      withdraw: vi.fn<(animalId: string) => Promise<void>>().mockResolvedValue(),
      reschedule: vi.fn<(animalId: string) => Promise<void>>().mockResolvedValue(),
    }
    service = createAnimalFollowService({
      animals: () => animals,
      treatments: () => treatments,
      periods: () => periods,
      reminders,
      today: () => TODAY,
    })
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  async function treatment(animalId: string, name: string, overrides = {}) {
    return treatments.create({
      id: crypto.randomUUID(),
      animalId,
      name,
      type: 'medication',
      settings: settings(overrides),
    })
  }

  async function stoppedOn(treatmentId: string): Promise<(string | null)[]> {
    return (await periods.listByTreatment(treatmentId)).map(({ stoppedOn }) => stoppedOn)
  }

  describe('unfollow', () => {
    it('AN-9 : note le jour du geste et retire tous ses rappels', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      vi.setSystemTime(NOW)

      await service.unfollow(luna.id)

      await expect(animals.getDeparture(luna.id)).resolves.toEqual({
        ...FOLLOWED,
        unfollowedOn: TODAY,
      })
      expect(reminders.withdraw).toHaveBeenCalledExactlyOnceWith(luna.id)
    })

    it('AN-11, TR-37 : arrête ses traitements en cours à la date du geste, pas ceux des autres', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      const milo = await animals.create({ name: 'Milo', species: 'dog' })
      const metacam = await treatment(luna.id, 'Métacam')
      const advocate = await treatment(luna.id, 'Advocate', {
        frequency: { value: 1, unit: 'month' },
      })
      const milbemax = await treatment(milo.id, 'Milbemax')

      await service.unfollow(luna.id)

      await expect(stoppedOn(metacam.id)).resolves.toEqual([TODAY])
      await expect(stoppedOn(advocate.id)).resolves.toEqual([TODAY])
      await expect(stoppedOn(milbemax.id)).resolves.toEqual([null])
    })

    it('laisse tels quels un traitement déjà arrêté et un traitement fini par sa date de fin', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      const stopped = await treatment(luna.id, 'Arrêté')
      await periods.stop(stopped.id, '2026-09-20')
      const ended = await treatment(luna.id, 'Fini', { endsOn: '2026-09-10' })

      const undo = await service.unfollow(luna.id)

      await expect(stoppedOn(stopped.id)).resolves.toEqual(['2026-09-20'])
      await expect(stoppedOn(ended.id)).resolves.toEqual([null])
      expect(undo?.stoppedPeriodIds).toEqual([])
    })

    it('écrit le départ et les arrêts dans une seule transaction', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      const metacam = await treatment(luna.id, 'Métacam')
      const failing = createAnimalFollowService({
        animals: () => animals,
        treatments: () => treatments,
        periods: () => ({
          ...periods,
          stopPeriodStatement: () => ({ sql: 'UPDATE table_inexistante SET x = 1' }),
        }),
        reminders,
        today: () => TODAY,
      })

      await expect(failing.unfollow(luna.id)).rejects.toThrow(/no such table/)

      await expect(animals.getDeparture(luna.id)).resolves.toEqual(FOLLOWED)
      await expect(stoppedOn(metacam.id)).resolves.toEqual([null])
      expect(reminders.withdraw).not.toHaveBeenCalled()
    })

    it('ne fait rien pour un animal qu’on ne suit déjà plus', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      await animals.setDeparture(luna.id, { ...FOLLOWED, unfollowedOn: '2026-09-20' })

      await expect(service.unfollow(luna.id)).resolves.toBeNull()

      await expect(animals.getDeparture(luna.id)).resolves.toMatchObject({
        unfollowedOn: '2026-09-20',
      })
    })

    it('lève pour un animal inconnu', async () => {
      await expect(service.unfollow('inconnu')).rejects.toThrow(/introuvable/)
    })
  })

  describe('undoUnfollow (« Annuler »)', () => {
    it('AN-11 : rétablit le suivi, les périodes arrêtées par le geste avec leurs identifiants, puis les rappels', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      const metacam = await treatment(luna.id, 'Métacam')
      const [period] = await periods.listByTreatment(metacam.id)
      const undo = (await service.unfollow(luna.id))!

      await service.undoUnfollow(undo)

      await expect(animals.getDeparture(luna.id)).resolves.toEqual(FOLLOWED)
      await expect(periods.listByTreatment(metacam.id)).resolves.toEqual([
        expect.objectContaining({ id: period?.id, stoppedOn: null }),
      ])
      expect(reminders.reschedule).toHaveBeenCalledExactlyOnceWith(luna.id)
    })

    it('ne reprend pas un traitement arrêté à la main le même jour', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      const byHand = await treatment(luna.id, 'Arrêté à la main')
      await periods.stop(byHand.id, TODAY)
      const metacam = await treatment(luna.id, 'Métacam')
      const undo = (await service.unfollow(luna.id))!

      await service.undoUnfollow(undo)

      await expect(stoppedOn(byHand.id)).resolves.toEqual([TODAY])
      await expect(stoppedOn(metacam.id)).resolves.toEqual([null])
    })
  })

  describe('follow (« Suivre de nouveau »)', () => {
    it('AN-11 : efface le départ, garde les traitements arrêtés et reprogramme ses rappels', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      const metacam = await treatment(luna.id, 'Métacam')
      await service.unfollow(luna.id)
      await animals.setDeparture(luna.id, {
        unfollowedOn: TODAY,
        departureReason: 'rehomed',
        departureDate: '2026-09-27',
      })

      await service.follow(luna.id)

      await expect(animals.getDeparture(luna.id)).resolves.toEqual(FOLLOWED)
      await expect(stoppedOn(metacam.id)).resolves.toEqual([TODAY])
      expect(reminders.reschedule).toHaveBeenCalledExactlyOnceWith(luna.id)
    })

    it('« Annuler » remet le départ tel qu’il était et retire de nouveau ses rappels', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })
      const departure = {
        unfollowedOn: '2026-09-20',
        departureReason: 'death',
        departureDate: '2026-09-19',
      } as const
      await animals.setDeparture(luna.id, departure)
      const undo = (await service.follow(luna.id))!

      await service.undoFollow(undo)

      await expect(animals.getDeparture(luna.id)).resolves.toEqual(departure)
      expect(reminders.withdraw).toHaveBeenCalledExactlyOnceWith(luna.id)
    })

    it('ne fait rien pour un animal déjà suivi', async () => {
      const luna = await animals.create({ name: 'Luna', species: 'cat' })

      await expect(service.follow(luna.id)).resolves.toBeNull()

      expect(reminders.reschedule).not.toHaveBeenCalled()
    })
  })
})
