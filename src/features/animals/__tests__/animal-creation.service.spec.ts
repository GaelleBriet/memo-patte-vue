// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createWeightRepository,
  type WeightRepository,
} from '@/features/weight/repository/weight.repository'
import { createAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'
import { createAnimalCreationService } from '../service/animal-creation.service'

const CREATION = new Date(2026, 8, 28, 12)

describe('animalCreationService', () => {
  let db: InMemoryDb
  let animals: AnimalsRepository
  let weight: WeightRepository

  beforeEach(async () => {
    vi.useFakeTimers({ now: CREATION, toFake: ['Date'] })
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    animals = createAnimalsRepository(db)
    weight = createWeightRepository(db)
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it('fait du poids saisi la première pesée, datée du jour de la création', async () => {
    const service = createAnimalCreationService(
      () => animals,
      () => weight,
    )

    const pixel = await service.create({ name: 'Pixel', species: 'cat', weightKg: 1.2 })

    await expect(animals.getById(pixel.id)).resolves.toEqual(pixel)
    await expect(weight.listByAnimal(pixel.id)).resolves.toEqual([
      expect.objectContaining({
        animalId: pixel.id,
        weightKg: 1.2,
        measuredOn: '2026-09-28',
        createdAt: pixel.createdAt,
      }),
    ])
  })

  it('crée l’animal seul quand aucun poids n’est saisi', async () => {
    const service = createAnimalCreationService(
      () => animals,
      () => weight,
    )

    const pixel = await service.create({ name: 'Pixel', species: 'cat', weightKg: null })

    await expect(animals.getById(pixel.id)).resolves.toEqual(pixel)
    await expect(weight.listByAnimal(pixel.id)).resolves.toEqual([])
  })

  it('n’écrit rien quand la première pesée échoue', async () => {
    const service = createAnimalCreationService(
      () => animals,
      () => ({ createStatement: () => ({ sql: 'INSERT INTO table_inexistante VALUES (1)' }) }),
    )

    await expect(service.create({ name: 'Pixel', species: 'cat', weightKg: 1.2 })).rejects.toThrow(
      /no such table/,
    )

    await expect(animals.list()).resolves.toEqual([])
  })

  it('refuse un poids hors bornes avant d’écrire quoi que ce soit', async () => {
    const service = createAnimalCreationService(
      () => animals,
      () => weight,
    )

    await expect(service.create({ name: 'Pixel', species: 'cat', weightKg: 250 })).rejects.toThrow(
      ZodError,
    )

    await expect(animals.list()).resolves.toEqual([])
  })
})
