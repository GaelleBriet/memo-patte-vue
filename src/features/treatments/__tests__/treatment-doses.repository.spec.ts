// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '@/core/db/db-client'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { getDb } from '@/core/db/sqlite'
import {
  createTreatmentDosesRepository,
  getTreatmentDosesRepository,
  type TreatmentDosesRepository,
} from '../repository/treatment-doses.repository'
import { createTreatmentsRepository } from '../repository/treatments.repository'

vi.mock('@/core/db/sqlite', () => ({ getDb: vi.fn<() => Promise<DbClient>>() }))

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
  let doses: TreatmentDosesRepository
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
    doses = createTreatmentDosesRepository(db)
    const treatments = createTreatmentsRepository(db)
    milbemax = (await treatments.create({ ...plan, animalId: MIETTE, name: 'Milbemax' })).id
    drontal = (await treatments.create({ ...plan, animalId: MIETTE, name: 'Drontal' })).id
    bravecto = (await treatments.create({ ...plan, animalId: VASCO, name: 'Bravecto' })).id
    await db.run(
      'UPDATE treatment_dose SET deleted_at = ?, updated_at = ? WHERE treatment_id = ?',
      [EARLIER, EARLIER, drontal],
    )
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

  it('liste les versions de toutes les prises, supprimées comprises', async () => {
    const versions = await doses.listVersions()

    expect(versions).toHaveLength(3)
    expect(versions).toContainEqual({
      id: drontal,
      treatmentId: drontal,
      givenOn: '2026-01-10',
      updatedAt: EARLIER,
      deletedAt: EARLIER,
    })
  })

  it('restaure une prise existante sans changer sa date ni son traitement', async () => {
    await db.runMany([
      doses.restoreStatement(
        {
          id: drontal,
          treatmentId: milbemax,
          animalId: VASCO,
          givenOn: '2026-02-10',
          nextDueDate: '2026-02-24',
          frequency: { value: 2, unit: 'week' },
          createdAt: NOW,
          updatedAt: NOW,
        },
        true,
      ),
    ])

    await expect(db.query('SELECT * FROM treatment_dose WHERE id = ?', [drontal])).resolves.toEqual(
      [
        expect.objectContaining({
          treatment_id: drontal,
          animal_id: MIETTE,
          given_on: '2026-01-10',
          next_due_date: '2026-02-24',
          frequency_value: 2,
          frequency_unit: 'week',
          updated_at: NOW,
          deleted_at: null,
        }),
      ],
    )
  })

  it('insère une prise absente avec l’identifiant choisi', async () => {
    const dose = {
      id: 'nouvelle',
      treatmentId: milbemax,
      animalId: MIETTE,
      givenOn: '2025-10-10',
      nextDueDate: '2026-01-10',
      frequency: { value: 3, unit: 'month' },
      createdAt: T0,
      updatedAt: NOW,
    } as const

    await db.runMany([doses.restoreStatement(dose, false)])

    await expect(
      db.query('SELECT * FROM treatment_dose WHERE id = ?', ['nouvelle']),
    ).resolves.toEqual([
      {
        id: 'nouvelle',
        treatment_id: milbemax,
        animal_id: MIETTE,
        given_on: '2025-10-10',
        next_due_date: '2026-01-10',
        frequency_value: 3,
        frequency_unit: 'month',
        created_at: T0,
        updated_at: NOW,
        deleted_at: null,
      },
    ])
  })
})

describe('getTreatmentDosesRepository', () => {
  it('ne met pas en cache une ouverture ratée, puis réutilise celle qui réussit', async () => {
    const db = await createInMemoryDb()
    vi.mocked(getDb).mockRejectedValueOnce(new Error('base indisponible'))
    await expect(getTreatmentDosesRepository()).rejects.toThrow('base indisponible')

    vi.mocked(getDb).mockResolvedValueOnce(db)
    const repository = await getTreatmentDosesRepository()
    await expect(repository.listVersions()).resolves.toEqual([])

    await expect(getTreatmentDosesRepository()).resolves.toBe(repository)
    db.close()
  })
})
