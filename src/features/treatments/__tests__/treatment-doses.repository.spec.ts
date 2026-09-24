// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { createTreatmentsRepository } from '../repository/treatments.repository'

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const T0 = '2026-01-01T00:00:00.000Z'
const EARLIER = '2026-02-01T00:00:00.000Z'
const NOW = '2026-03-01T10:00:00.000Z'

const plan = {
  type: 'deworming',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-01-10',
} as const

interface Tombstone {
  treatment_id: string
  deleted_at: string | null
}

describe('treatmentDosesRepository', () => {
  let db: InMemoryDb
  const doses = createTreatmentDosesRepository()
  let milbemax: string
  let drontal: string
  let bravecto: string

  function tombstones(): Promise<Tombstone[]> {
    return db.query<Tombstone>('SELECT treatment_id, deleted_at FROM treatment_dose')
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, 'Miette', 'cat', ?, ?), (?, 'Vasco', 'dog', ?, ?)`,
      [MIETTE, T0, T0, VASCO, T0, T0],
    )
    const treatments = createTreatmentsRepository(db)
    milbemax = (await treatments.create({ ...plan, animalId: MIETTE, name: 'Milbemax' })).id
    drontal = (await treatments.create({ ...plan, animalId: MIETTE, name: 'Drontal' })).id
    bravecto = (await treatments.create({ ...plan, animalId: VASCO, name: 'Bravecto' })).id
    await db.run('UPDATE treatment_dose SET deleted_at = ? WHERE treatment_id = ?', [
      EARLIER,
      drontal,
    ])
  })

  afterEach(() => {
    db.close()
  })

  it('marque les prises d’un animal, sans changer la date de celles déjà supprimées', async () => {
    await db.runMany([doses.markDeletedByAnimalStatement(MIETTE, NOW)])

    await expect(tombstones()).resolves.toEqual(
      expect.arrayContaining([
        { treatment_id: milbemax, deleted_at: NOW },
        { treatment_id: drontal, deleted_at: EARLIER },
        { treatment_id: bravecto, deleted_at: null },
      ]),
    )
  })

  it('marque toutes les prises encore visibles, sans changer la date des autres', async () => {
    await db.runMany([doses.markAllDeletedStatement(NOW)])

    await expect(tombstones()).resolves.toEqual(
      expect.arrayContaining([
        { treatment_id: milbemax, deleted_at: NOW },
        { treatment_id: drontal, deleted_at: EARLIER },
        { treatment_id: bravecto, deleted_at: NOW },
      ]),
    )
  })
})
