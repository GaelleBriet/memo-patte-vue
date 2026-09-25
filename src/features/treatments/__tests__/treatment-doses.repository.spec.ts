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
import { addFrequency } from '../logic/treatment-frequency'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentFrequency } from '../schema/treatment.schema'

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

  it('liste les prises visibles de tous les traitements, jamais une supprimée', async () => {
    const recente: TreatmentDose = {
      id: 'recente',
      treatmentId: milbemax,
      animalId: MIETTE,
      givenOn: '2026-04-10',
      nextDueDate: '2026-07-10',
      frequency: { value: 3, unit: 'month' },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    }
    await doses.record(recente)

    const liste = await doses.listAll()

    expect(liste.map(({ id }) => id).sort()).toEqual(['recente', milbemax, bravecto].sort())
    expect(liste).toContainEqual(recente)
  })

  it('restaure une prise existante à la date du fichier, sans changer son traitement ni son animal', async () => {
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
          given_on: '2026-02-10',
          next_due_date: '2026-02-24',
          frequency_value: 2,
          frequency_unit: 'week',
          updated_at: NOW,
          deleted_at: null,
        }),
      ],
    )
  })

  it('ramène une prise supprimée sans toucher ses dates, son échéance ni sa fréquence', async () => {
    const [avant] = await db.query('SELECT * FROM treatment_dose WHERE id = ?', [drontal])

    await db.runMany([doses.reviveStatement(drontal, NOW)])

    await expect(db.query('SELECT * FROM treatment_dose WHERE id = ?', [drontal])).resolves.toEqual(
      [{ ...(avant as object), updated_at: NOW, deleted_at: null }],
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

describe('treatmentDosesRepository — noter et annuler une prise', () => {
  let db: InMemoryDb
  let doses: TreatmentDosesRepository
  let milbemax: string

  function prise(id: string, givenOn: string, surcharges: Partial<TreatmentDose> = {}) {
    return {
      id,
      treatmentId: milbemax,
      animalId: MIETTE,
      givenOn,
      nextDueDate: '2026-12-20',
      frequency: { value: 3, unit: 'month' },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      ...surcharges,
    } satisfies TreatmentDose
  }

  function prises() {
    return db.query<{ id: string; given_on: string; deleted_at: string | null }>(
      'SELECT id, given_on, deleted_at FROM treatment_dose WHERE treatment_id = ? ORDER BY given_on, id',
      [milbemax],
    )
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, 'Miette', 'cat', ?, ?)`,
      [MIETTE, T0, T0],
    )
    doses = createTreatmentDosesRepository(db)
    milbemax = (
      await createTreatmentsRepository(db).create({ ...plan, animalId: MIETTE, name: 'Milbemax' })
    ).id
  })

  afterEach(() => {
    db.close()
  })

  it('note une prise et le dit', async () => {
    await expect(doses.record(prise('p1', '2026-09-20'))).resolves.toBe(true)

    await expect(prises()).resolves.toEqual([
      { id: milbemax, given_on: '2026-01-10', deleted_at: null },
      { id: 'p1', given_on: '2026-09-20', deleted_at: null },
    ])
  })

  it('ne note pas une seconde prise du même jour pour le même traitement', async () => {
    await doses.record(prise('p1', '2026-09-20'))

    await expect(doses.record(prise('p2', '2026-09-20'))).resolves.toBe(false)

    await expect(prises()).resolves.toHaveLength(2)
  })

  it('note de nouveau une prise dont celle du même jour a été annulée', async () => {
    await doses.record(prise('p1', '2026-09-20'))
    await doses.remove('p1', NOW)

    await expect(doses.record(prise('p2', '2026-09-20'))).resolves.toBe(true)
  })

  it('annule une prise par une date de suppression, sans toucher les autres', async () => {
    await doses.record(prise('p1', '2026-09-20'))

    await doses.remove('p1', NOW)

    await expect(prises()).resolves.toEqual([
      { id: milbemax, given_on: '2026-01-10', deleted_at: null },
      { id: 'p1', given_on: '2026-09-20', deleted_at: NOW },
    ])
  })

  it('ne change pas la date d’une prise déjà annulée', async () => {
    await doses.record(prise('p1', '2026-09-20'))
    await doses.remove('p1', EARLIER)

    await doses.remove('p1', NOW)

    await expect(prises()).resolves.toContainEqual({
      id: 'p1',
      given_on: '2026-09-20',
      deleted_at: EARLIER,
    })
  })
})

describe('treatmentDosesRepository — historique', () => {
  let db: InMemoryDb
  let doses: TreatmentDosesRepository
  let milbemax: string
  let bravecto: string

  function prise(id: string, givenOn: string, surcharges: Partial<TreatmentDose> = {}) {
    return {
      id,
      treatmentId: milbemax,
      animalId: MIETTE,
      givenOn,
      nextDueDate: '2026-12-20',
      frequency: { value: 3, unit: 'month' },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      ...surcharges,
    } satisfies TreatmentDose
  }

  function ligne(id: string) {
    return db.query('SELECT * FROM treatment_dose WHERE id = ?', [id])
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
    bravecto = (await treatments.create({ ...plan, animalId: VASCO, name: 'Bravecto' })).id
  })

  afterEach(() => {
    db.close()
  })

  it('liste les prises visibles d’un traitement, la tête d’abord', async () => {
    await doses.record(prise('ancienne', '2025-10-10'))
    await doses.record(prise('recente', '2026-04-10'))
    await doses.record(prise('annulee', '2026-05-10'))
    await doses.remove('annulee', NOW)

    const liste = await doses.listByTreatment(milbemax)

    expect(liste.map(({ id }) => id)).toEqual(['recente', milbemax, 'ancienne'])
    expect(liste[0]).toEqual(prise('recente', '2026-04-10'))
  })

  it('lit une prise visible, jamais une prise supprimée', async () => {
    await doses.record(prise('p1', '2026-04-10'))

    await expect(doses.getById('p1')).resolves.toEqual(prise('p1', '2026-04-10'))
    await doses.remove('p1', NOW)
    await expect(doses.getById('p1')).resolves.toBeNull()
  })

  it('compte les prises visibles de chaque traitement d’un animal', async () => {
    await doses.record(prise('p1', '2026-04-10'))
    await doses.record(prise('p2', '2026-05-10'))
    await doses.remove('p2', NOW)

    await expect(doses.countByAnimal(MIETTE)).resolves.toEqual({ [milbemax]: 2 })
    await expect(doses.countByAnimal(VASCO)).resolves.toEqual({ [bravecto]: 1 })
  })

  it('ne supprime jamais la seule prise visible d’un traitement', async () => {
    await expect(doses.remove(milbemax, NOW)).resolves.toBe(false)

    await expect(ligne(milbemax)).resolves.toMatchObject([{ deleted_at: null }])
  })

  it('ne compte pas une prise supprimée : la restante, seule visible, est gardée', async () => {
    await doses.record(prise('p1', '2026-04-10'))
    await doses.remove('p1', EARLIER)

    await expect(doses.remove(milbemax, NOW)).resolves.toBe(false)

    await expect(doses.listByTreatment(milbemax)).resolves.toMatchObject([{ id: milbemax }])
  })

  it('supprime une prise quand une autre reste visible, et le dit', async () => {
    await doses.record(prise('p1', '2026-04-10'))

    await expect(doses.remove(milbemax, NOW)).resolves.toBe(true)

    await expect(doses.listByTreatment(milbemax)).resolves.toMatchObject([{ id: 'p1' }])
  })

  it('rétablit une prise supprimée, sans toucher sa date ni son échéance', async () => {
    await doses.record(prise('p1', '2026-04-10'))
    await doses.remove('p1', EARLIER)

    await expect(doses.revive('p1', NOW)).resolves.toBe(true)

    await expect(doses.getById('p1')).resolves.toEqual(prise('p1', '2026-04-10'))
    await expect(doses.revive('p1', NOW)).resolves.toBe(false)
  })

  it('ne rétablit pas une prise dont le jour a été noté entre-temps', async () => {
    await doses.record(prise('p1', '2026-04-10'))
    await doses.remove('p1', EARLIER)
    await doses.record(prise('p2', '2026-04-10'))

    await expect(doses.revive('p1', NOW)).resolves.toBe(false)
  })

  it('change la date d’une prise avec son échéance et sa fréquence', async () => {
    await doses.record(prise('p1', '2026-04-10'))

    await expect(
      doses.changeDate(
        'p1',
        {
          givenOn: '2026-04-12',
          nextDueDate: '2026-05-12',
          frequency: { value: 1, unit: 'month' },
        },
        LATER,
      ),
    ).resolves.toBe(true)

    await expect(doses.getById('p1')).resolves.toEqual(
      prise('p1', '2026-04-12', {
        nextDueDate: '2026-05-12',
        frequency: { value: 1, unit: 'month' },
        updatedAt: LATER,
      }),
    )
  })

  it('ne déplace pas une prise sur le jour d’une autre, ni une prise supprimée', async () => {
    await doses.record(prise('p1', '2026-04-10'))
    await doses.record(prise('p2', '2026-05-10'))
    const dates = { givenOn: '2026-05-10', nextDueDate: '2026-08-10', frequency: plan.frequency }

    await expect(doses.changeDate('p1', dates, LATER)).resolves.toBe(false)
    await doses.remove('p2', NOW)
    await expect(doses.changeDate('p2', dates, LATER)).resolves.toBe(false)
    await expect(doses.changeDate('p1', dates, LATER)).resolves.toBe(true)
  })
})

describe('treatmentDosesRepository — réconciliation des prises à fréquence périmée', () => {
  let db: InMemoryDb
  let doses: TreatmentDosesRepository
  let milbemax: string

  function prise(id: string, givenOn: string, surcharges: Partial<TreatmentDose> = {}) {
    return {
      id,
      treatmentId: milbemax,
      animalId: MIETTE,
      givenOn,
      nextDueDate: '2026-12-20',
      frequency: { value: 3, unit: 'month' },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      ...surcharges,
    } satisfies TreatmentDose
  }

  function planMensuel(): Promise<number> {
    return db.run(
      `UPDATE treatment SET frequency_value = 1, frequency_unit = 'month' WHERE id = ?`,
      [milbemax],
    )
  }

  async function reconcile(): Promise<void> {
    await db.runMany([doses.reconcileStaleHeadsStatement(LATER)])
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, 'Miette', 'cat', ?, ?)`,
      [MIETTE, T0, T0],
    )
    doses = createTreatmentDosesRepository(db)
    milbemax = (
      await createTreatmentsRepository(db).create({ ...plan, animalId: MIETTE, name: 'Milbemax' })
    ).id
  })

  afterEach(() => {
    db.close()
  })

  it('recalcule depuis la dernière prise la prochaine dose fixée avec une autre fréquence que le plan', async () => {
    await doses.record(prise('ancienne', '2025-10-10', { frequency: { value: 2, unit: 'week' } }))
    await doses.record(prise('annulee', '2026-02-01', { deletedAt: NOW }))
    await planMensuel()

    await reconcile()

    await expect(doses.getById(milbemax)).resolves.toEqual(
      expect.objectContaining({
        givenOn: '2026-01-10',
        nextDueDate: '2026-02-10',
        frequency: { value: 1, unit: 'month' },
        updatedAt: LATER,
      }),
    )
    await expect(doses.getById('ancienne')).resolves.toEqual(
      prise('ancienne', '2025-10-10', { frequency: { value: 2, unit: 'week' } }),
    )
  })

  it('recalcule aussi une prise de tête de même valeur mais d’une autre unité que le plan', async () => {
    await db.run(`UPDATE treatment SET frequency_unit = 'week' WHERE id = ?`, [milbemax])

    await reconcile()

    await expect(doses.getById(milbemax)).resolves.toMatchObject({
      nextDueDate: '2026-01-31',
      frequency: { value: 3, unit: 'week' },
      updatedAt: LATER,
    })
  })

  it('ne touche jamais une prise de tête déjà à la fréquence du plan : un report reste', async () => {
    await doses.record(prise('reportee', '2026-03-01', { nextDueDate: '2026-09-30' }))

    await reconcile()

    await expect(doses.getById('reportee')).resolves.toEqual(
      prise('reportee', '2026-03-01', { nextDueDate: '2026-09-30' }),
    )
  })

  it('laisse la prise de tête d’un traitement arrêté ou supprimé', async () => {
    await planMensuel()
    await db.run(`UPDATE treatment SET stopped_on = '2026-02-01' WHERE id = ?`, [milbemax])
    await reconcile()
    await db.run(`UPDATE treatment SET stopped_on = NULL, deleted_at = ? WHERE id = ?`, [
      NOW,
      milbemax,
    ])
    await reconcile()

    await expect(doses.getById(milbemax)).resolves.toMatchObject({
      nextDueDate: '2026-04-10',
      frequency: { value: 3, unit: 'month' },
    })
  })

  it('calcule la même date que l’app, fin de mois et années bissextiles comprises', async () => {
    const days = [
      '2024-01-29',
      '2024-01-31',
      '2024-02-29',
      '2025-01-30',
      '2025-03-31',
      '2025-05-31',
      '2025-08-31',
      '2025-12-31',
      '2026-02-28',
      '2026-06-15',
    ]
    const frequencies: TreatmentFrequency[] = [
      { value: 1, unit: 'day' },
      { value: 365, unit: 'day' },
      { value: 1, unit: 'week' },
      { value: 52, unit: 'week' },
      { value: 1, unit: 'month' },
      { value: 3, unit: 'month' },
      { value: 12, unit: 'month' },
      { value: 13, unit: 'month' },
      { value: 365, unit: 'month' },
    ]
    const cases = days.flatMap((givenOn) =>
      frequencies.map((frequency) => ({ id: crypto.randomUUID(), givenOn, frequency })),
    )
    await db.runMany(
      cases.flatMap(({ id, givenOn, frequency }) => [
        {
          sql: `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit,
                  created_at, updated_at)
                VALUES (?, ?, 'Plan', 'deworming', ?, ?, ?, ?)`,
          params: [id, MIETTE, frequency.value, frequency.unit, T0, T0],
        },
        doses.insertStatement(
          prise(id, givenOn, { treatmentId: id, frequency: { value: 2, unit: 'day' } }),
        ),
      ]),
    )

    await reconcile()

    const heads = await Promise.all(cases.map(({ id }) => doses.getById(id)))
    expect(heads.map((head) => head?.nextDueDate)).toEqual(
      cases.map(({ givenOn, frequency }) => addFrequency(givenOn, frequency)),
    )
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
