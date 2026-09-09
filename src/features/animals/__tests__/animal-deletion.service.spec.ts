// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- vrai moteur SQL : la transaction ne se teste pas avec un faux repository
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import { createAnimalDeletionService, type AnimalDeletionService } from '../animal-deletion.service'
import { createAnimalsRepository, type AnimalsRepository } from '../animals.repository'

interface Tombstone {
  deleted_at: string | null
  updated_at: string
}

describe('animalDeletionService', () => {
  let db: InMemoryDb
  let animals: AnimalsRepository
  let vaccinations: VaccinationsRepository
  let service: AnimalDeletionService

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    animals = createAnimalsRepository(db)
    vaccinations = createVaccinationsRepository(db)
    service = createAnimalDeletionService(() => animals, [() => vaccinations])
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  async function animalTombstone(id: string): Promise<Tombstone | undefined> {
    const rows = await db.query<Tombstone>(
      'SELECT deleted_at, updated_at FROM animal WHERE id = ?',
      [id],
    )
    return rows[0]
  }

  async function vaccinationTombstones(animalId: string): Promise<Tombstone[]> {
    return db.query<Tombstone>(
      'SELECT deleted_at, updated_at FROM vaccination WHERE animal_id = ? ORDER BY name',
      [animalId],
    )
  }

  it('marque l’animal et ses vaccins avec la même date de suppression', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Typhus',
      lastInjectionDate: '2025-09-12',
    })
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    const expected: Tombstone = {
      deleted_at: '2026-03-01T10:01:00.000Z',
      updated_at: '2026-03-01T10:01:00.000Z',
    }
    await expect(animalTombstone(miette.id)).resolves.toEqual(expected)
    await expect(vaccinationTombstones(miette.id)).resolves.toEqual([expected, expected])
    await expect(animals.getById(miette.id)).resolves.toBeNull()
    await expect(vaccinations.listByAnimal(miette.id)).resolves.toEqual([])
  })

  it('laisse intacts les autres animaux et leurs vaccins', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const vasco = await animals.create({ name: 'Vasco', species: 'dog' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    const chppi = await vaccinations.create({
      animalId: vasco.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-11-02',
    })

    await service.remove(miette.id)

    await expect(animals.getById(vasco.id)).resolves.toEqual(vasco)
    await expect(vaccinations.listByAnimal(vasco.id)).resolves.toEqual([chppi])
  })

  it('ne marque ni l’animal ni ses vaccins quand une instruction de la cascade échoue', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const rage = await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    const failing = createAnimalDeletionService(
      () => animals,
      [
        () => vaccinations,
        () => ({
          markDeletedByAnimalStatement: () => ({
            sql: 'UPDATE table_inexistante SET deleted_at = 1',
          }),
        }),
      ],
    )

    await expect(failing.remove(miette.id)).rejects.toThrow(/no such table/)

    await expect(animals.getById(miette.id)).resolves.toEqual(miette)
    await expect(vaccinations.listByAnimal(miette.id)).resolves.toEqual([rage])
    await expect(animalTombstone(miette.id)).resolves.toMatchObject({ deleted_at: null })
    await expect(vaccinationTombstones(miette.id)).resolves.toEqual([
      { deleted_at: null, updated_at: rage.updatedAt },
    ])
  })

  it('ne change aucune date déjà posée lors d’une seconde suppression', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await service.remove(miette.id)
    const animalBefore = await animalTombstone(miette.id)
    const vaccinationsBefore = await vaccinationTombstones(miette.id)
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    await expect(animalTombstone(miette.id)).resolves.toEqual(animalBefore)
    await expect(vaccinationTombstones(miette.id)).resolves.toEqual(vaccinationsBefore)
    expect(animalBefore?.deleted_at).toBe('2026-03-01T10:00:00.000Z')
  })

  it('ne touche pas la date d’un vaccin supprimé avant l’animal', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const rage = await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await vaccinations.remove(rage.id)
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    await expect(vaccinationTombstones(miette.id)).resolves.toEqual([
      { deleted_at: '2026-03-01T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' },
    ])
  })

  it('conserve toutes les lignes en base : jamais de DELETE', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Typhus',
      lastInjectionDate: '2025-09-12',
    })

    await service.remove(miette.id)

    const [animalCount] = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM animal')
    const [vaccinationCount] = await db.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM vaccination',
    )
    expect(animalCount?.n).toBe(1)
    expect(vaccinationCount?.n).toBe(2)
  })
})
