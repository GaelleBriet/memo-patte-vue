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
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import { seedTreatmentWithDose } from './seed-treatment'

vi.mock('@/core/db/sqlite', () => ({ getDb: vi.fn<() => Promise<DbClient>>() }))

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const T0 = '2026-01-01T00:00:00.000Z'
const EARLIER = '2026-02-01T00:00:00.000Z'
const NOW = '2026-03-01T10:00:00.000Z'
const LATER = '2026-03-02T10:00:00.000Z'

const plan = {
  type: 'deworming',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-01-10',
} as const

const TRIMESTRIELLE = { frequency: { value: 3, unit: 'month' } } as const

/** Première période et première prise d'un traitement créé portent son identifiant. */
function prise(
  treatmentId: string,
  id: string,
  givenOn: string,
  surcharges: Partial<NewTreatmentDose> = {},
): NewTreatmentDose {
  return {
    id,
    periodId: treatmentId,
    treatmentId,
    animalId: MIETTE,
    dueOn: givenOn,
    dueTime: null,
    givenOn,
    status: 'given',
    nextDueDate: '2026-12-20',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...surcharges,
  }
}

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
    milbemax = (await seedTreatmentWithDose(db, { ...plan, animalId: MIETTE, name: 'Milbemax' })).id
    drontal = (await seedTreatmentWithDose(db, { ...plan, animalId: MIETTE, name: 'Drontal' })).id
    bravecto = (await seedTreatmentWithDose(db, { ...plan, animalId: VASCO, name: 'Bravecto' })).id
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
      periodId: drontal,
      treatmentId: drontal,
      updatedAt: EARLIER,
      deletedAt: EARLIER,
    })
  })

  it('liste les prises visibles de tous les traitements, avec la fréquence de leur période', async () => {
    const recente = prise(milbemax, 'recente', '2026-04-10', { nextDueDate: '2026-07-10' })
    await db.runMany([doses.insertStatement(recente)])

    const liste = await doses.listAll()

    expect(liste.map(({ id }) => id).sort()).toEqual(['recente', milbemax, bravecto].sort())
    expect(liste).toContainEqual({ ...recente, ...TRIMESTRIELLE })
  })

  it('restaure une prise existante aux valeurs du fichier, date de création comprise, sans changer sa période, son traitement ni son animal', async () => {
    await db.runMany([
      doses.restoreStatement(
        {
          ...prise(milbemax, drontal, '2026-02-10'),
          animalId: VASCO,
          dueOn: '2026-02-08',
          dueTime: '20:00',
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-02-24',
        },
        true,
      ),
    ])

    await expect(db.query('SELECT * FROM treatment_dose WHERE id = ?', [drontal])).resolves.toEqual(
      [
        expect.objectContaining({
          period_id: drontal,
          treatment_id: drontal,
          animal_id: MIETTE,
          due_on: '2026-02-08',
          due_time: '20:00',
          given_on: null,
          status: 'postponed',
          next_due_date: '2026-02-24',
          created_at: NOW,
          updated_at: NOW,
          deleted_at: null,
        }),
      ],
    )
  })

  it('ramène une prise supprimée sans toucher ses dates, son échéance ni sa période', async () => {
    const [avant] = await db.query('SELECT * FROM treatment_dose WHERE id = ?', [drontal])

    await db.runMany([doses.reviveStatement(drontal, NOW)])

    await expect(db.query('SELECT * FROM treatment_dose WHERE id = ?', [drontal])).resolves.toEqual(
      [{ ...(avant as object), updated_at: NOW, deleted_at: null }],
    )
  })

  it('insère une prise absente avec l’identifiant choisi', async () => {
    const dose = {
      ...prise(milbemax, 'nouvelle', '2025-10-10'),
      nextDueDate: '2026-01-10',
      createdAt: T0,
    }

    await db.runMany([doses.restoreStatement(dose, false)])

    await expect(
      db.query('SELECT * FROM treatment_dose WHERE id = ?', ['nouvelle']),
    ).resolves.toEqual([
      {
        id: 'nouvelle',
        period_id: milbemax,
        treatment_id: milbemax,
        animal_id: MIETTE,
        due_on: '2025-10-10',
        due_time: null,
        given_on: '2025-10-10',
        status: 'given',
        next_due_date: '2026-01-10',
        created_at: T0,
        updated_at: NOW,
        deleted_at: null,
      },
    ])
  })
})

describe('treatmentDosesRepository — historique', () => {
  let db: InMemoryDb
  let doses: TreatmentDosesRepository
  let milbemax: string

  function prisePlan(id: string, givenOn: string, surcharges: Partial<NewTreatmentDose> = {}) {
    return prise(milbemax, id, givenOn, surcharges)
  }

  function lue(id: string, givenOn: string, surcharges: Partial<NewTreatmentDose> = {}) {
    return { ...prisePlan(id, givenOn, surcharges), ...TRIMESTRIELLE }
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
    milbemax = (await seedTreatmentWithDose(db, { ...plan, animalId: MIETTE, name: 'Milbemax' })).id
    await seedTreatmentWithDose(db, { ...plan, animalId: VASCO, name: 'Bravecto' })
  })

  afterEach(() => {
    db.close()
  })

  it('liste les prises visibles d’un traitement, la tête d’abord', async () => {
    await db.runMany([doses.insertStatement(prisePlan('ancienne', '2025-10-10'))])
    await db.runMany([doses.insertStatement(prisePlan('recente', '2026-04-10'))])
    await db.runMany([doses.insertStatement(prisePlan('annulee', '2026-05-10'))])
    await db.runMany([doses.markDeletedStatement(['annulee'], NOW)])

    const liste = await doses.listByTreatment(milbemax)

    expect(liste.map(({ id }) => id)).toEqual(['recente', milbemax, 'ancienne'])
    expect(liste[0]).toEqual(lue('recente', '2026-04-10'))
  })

  it('trie par échéance, jour puis heure, puis par saisie, jamais par date réelle', async () => {
    await db.runMany([
      doses.insertStatement(
        prisePlan('tardive', '2026-04-20', { dueOn: '2026-04-10', createdAt: LATER }),
      ),
    ])
    await db.runMany([
      doses.insertStatement(
        prisePlan('matin', '2026-04-12', { dueOn: '2026-04-10', dueTime: '08:00' }),
      ),
    ])
    await db.runMany([
      doses.insertStatement(prisePlan('avance', '2026-04-05', { dueOn: '2026-04-11' })),
    ])

    const liste = await doses.listByTreatment(milbemax)

    expect(liste.map(({ id }) => id)).toEqual(['avance', 'matin', 'tardive', milbemax])
  })

  it('lit une prise visible, jamais une prise supprimée', async () => {
    await db.runMany([doses.insertStatement(prisePlan('p1', '2026-04-10'))])

    await expect(doses.getById('p1')).resolves.toEqual(lue('p1', '2026-04-10'))
    await db.runMany([doses.markDeletedStatement(['p1'], NOW)])
    await expect(doses.getById('p1')).resolves.toBeNull()
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
