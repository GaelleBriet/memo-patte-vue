// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createVaccinationInjectionsRepository } from '../repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '../repository/vaccinations.repository'

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const T0 = '2026-01-01T00:00:00.000Z'
const EARLIER = '2026-02-01T00:00:00.000Z'
const NOW = '2026-03-01T10:00:00.000Z'

interface Tombstone {
  vaccination_id: string
  deleted_at: string | null
}

describe('vaccinationInjectionsRepository', () => {
  let db: InMemoryDb
  const injections = createVaccinationInjectionsRepository()
  let rage: string
  let typhus: string
  let chppi: string

  function tombstones(): Promise<Tombstone[]> {
    return db.query<Tombstone>(
      'SELECT vaccination_id, deleted_at FROM vaccination_injection ORDER BY created_at, vaccination_id',
    )
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, 'Miette', 'cat', ?, ?), (?, 'Vasco', 'dog', ?, ?)`,
      [MIETTE, T0, T0, VASCO, T0, T0],
    )
    const vaccinations = createVaccinationsRepository(db)
    const create = async (animalId: string, name: string) =>
      (await vaccinations.create({ animalId, name, lastInjectionDate: '2025-01-01' })).id
    rage = await create(MIETTE, 'Rage')
    typhus = await create(MIETTE, 'Typhus')
    chppi = await create(VASCO, 'CHPPi')
    await db.run('UPDATE vaccination_injection SET deleted_at = ? WHERE vaccination_id = ?', [
      EARLIER,
      typhus,
    ])
  })

  afterEach(() => {
    db.close()
  })

  it('marque les injections d’un animal, sans changer la date de celles déjà supprimées', async () => {
    await db.runMany([injections.markDeletedByAnimalStatement(MIETTE, NOW)])

    await expect(tombstones()).resolves.toEqual(
      expect.arrayContaining([
        { vaccination_id: rage, deleted_at: NOW },
        { vaccination_id: typhus, deleted_at: EARLIER },
        { vaccination_id: chppi, deleted_at: null },
      ]),
    )
  })

  it('marque toutes les injections encore visibles, sans changer la date des autres', async () => {
    await db.runMany([injections.markAllDeletedStatement(NOW)])

    await expect(tombstones()).resolves.toEqual(
      expect.arrayContaining([
        { vaccination_id: rage, deleted_at: NOW },
        { vaccination_id: typhus, deleted_at: EARLIER },
        { vaccination_id: chppi, deleted_at: NOW },
      ]),
    )
  })
})
