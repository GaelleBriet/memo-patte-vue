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
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'

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
      periodId: drontal,
      treatmentId: drontal,
      updatedAt: EARLIER,
      deletedAt: EARLIER,
    })
  })

  it('liste les prises visibles de tous les traitements, avec la fréquence de leur période', async () => {
    const recente = prise(milbemax, 'recente', '2026-04-10', { nextDueDate: '2026-07-10' })
    await doses.record(recente)

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

describe('treatmentDosesRepository — noter et annuler une prise', () => {
  let db: InMemoryDb
  let doses: TreatmentDosesRepository
  let milbemax: string

  function prisePlan(id: string, givenOn: string) {
    return prise(milbemax, id, givenOn)
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
    await expect(doses.record(prisePlan('p1', '2026-09-20'))).resolves.toBe(true)

    await expect(prises()).resolves.toEqual([
      { id: milbemax, given_on: '2026-01-10', deleted_at: null },
      { id: 'p1', given_on: '2026-09-20', deleted_at: null },
    ])
  })

  it('écrit la prise donnée telle quelle, rattachée à sa période', async () => {
    await doses.record(prisePlan('p1', '2026-09-20'))

    await expect(db.query('SELECT * FROM treatment_dose WHERE id = ?', ['p1'])).resolves.toEqual([
      {
        id: 'p1',
        period_id: milbemax,
        treatment_id: milbemax,
        animal_id: MIETTE,
        due_on: '2026-09-20',
        due_time: null,
        given_on: '2026-09-20',
        status: 'given',
        next_due_date: '2026-12-20',
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
      },
    ])
  })

  it('ne note pas une seconde prise du même jour pour le même traitement', async () => {
    await doses.record(prisePlan('p1', '2026-09-20'))

    await expect(doses.record(prisePlan('p2', '2026-09-20'))).resolves.toBe(false)

    await expect(prises()).resolves.toHaveLength(2)
  })

  it('note de nouveau une prise dont celle du même jour a été annulée', async () => {
    await doses.record(prisePlan('p1', '2026-09-20'))
    await doses.remove('p1', NOW)

    await expect(doses.record(prisePlan('p2', '2026-09-20'))).resolves.toBe(true)
  })

  it('annule une prise par une date de suppression, sans toucher les autres', async () => {
    await doses.record(prisePlan('p1', '2026-09-20'))

    await doses.remove('p1', NOW)

    await expect(prises()).resolves.toEqual([
      { id: milbemax, given_on: '2026-01-10', deleted_at: null },
      { id: 'p1', given_on: '2026-09-20', deleted_at: NOW },
    ])
  })

  it('ne change pas la date d’une prise déjà annulée', async () => {
    await doses.record(prisePlan('p1', '2026-09-20'))
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

  function prisePlan(id: string, givenOn: string, surcharges: Partial<NewTreatmentDose> = {}) {
    return prise(milbemax, id, givenOn, surcharges)
  }

  function lue(id: string, givenOn: string, surcharges: Partial<NewTreatmentDose> = {}) {
    return { ...prisePlan(id, givenOn, surcharges), ...TRIMESTRIELLE }
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
    await doses.record(prisePlan('ancienne', '2025-10-10'))
    await doses.record(prisePlan('recente', '2026-04-10'))
    await doses.record(prisePlan('annulee', '2026-05-10'))
    await doses.remove('annulee', NOW)

    const liste = await doses.listByTreatment(milbemax)

    expect(liste.map(({ id }) => id)).toEqual(['recente', milbemax, 'ancienne'])
    expect(liste[0]).toEqual(lue('recente', '2026-04-10'))
  })

  it('trie par échéance, jour puis heure, puis par saisie, jamais par date réelle', async () => {
    await doses.record(
      prisePlan('tardive', '2026-04-20', { dueOn: '2026-04-10', createdAt: LATER }),
    )
    await doses.record(prisePlan('matin', '2026-04-12', { dueOn: '2026-04-10', dueTime: '08:00' }))
    await doses.record(prisePlan('avance', '2026-04-05', { dueOn: '2026-04-11' }))

    const liste = await doses.listByTreatment(milbemax)

    expect(liste.map(({ id }) => id)).toEqual(['avance', 'matin', 'tardive', milbemax])
  })

  it('lit une prise visible, jamais une prise supprimée', async () => {
    await doses.record(prisePlan('p1', '2026-04-10'))

    await expect(doses.getById('p1')).resolves.toEqual(lue('p1', '2026-04-10'))
    await doses.remove('p1', NOW)
    await expect(doses.getById('p1')).resolves.toBeNull()
  })

  it('compte les prises visibles de chaque traitement d’un animal', async () => {
    await doses.record(prisePlan('p1', '2026-04-10'))
    await doses.record(prisePlan('p2', '2026-05-10'))
    await doses.remove('p2', NOW)

    await expect(doses.countByAnimal(MIETTE)).resolves.toEqual({ [milbemax]: 2 })
    await expect(doses.countByAnimal(VASCO)).resolves.toEqual({ [bravecto]: 1 })
  })

  it('ne supprime jamais la seule prise visible d’un traitement', async () => {
    await expect(doses.remove(milbemax, NOW)).resolves.toBe(false)

    await expect(ligne(milbemax)).resolves.toMatchObject([{ deleted_at: null }])
  })

  it('ne compte pas une prise supprimée : la restante, seule visible, est gardée', async () => {
    await doses.record(prisePlan('p1', '2026-04-10'))
    await doses.remove('p1', EARLIER)

    await expect(doses.remove(milbemax, NOW)).resolves.toBe(false)

    await expect(doses.listByTreatment(milbemax)).resolves.toMatchObject([{ id: milbemax }])
  })

  it('supprime une prise quand une autre reste visible, et le dit', async () => {
    await doses.record(prisePlan('p1', '2026-04-10'))

    await expect(doses.remove(milbemax, NOW)).resolves.toBe(true)

    await expect(doses.listByTreatment(milbemax)).resolves.toMatchObject([{ id: 'p1' }])
  })

  it('rétablit une prise supprimée, sans toucher sa date ni son échéance', async () => {
    await doses.record(prisePlan('p1', '2026-04-10'))
    await doses.remove('p1', EARLIER)

    await expect(doses.revive('p1', NOW)).resolves.toBe(true)

    await expect(doses.getById('p1')).resolves.toEqual(lue('p1', '2026-04-10'))
    await expect(doses.revive('p1', NOW)).resolves.toBe(false)
  })

  it('ne rétablit pas une prise dont le jour a été noté entre-temps', async () => {
    await doses.record(prisePlan('p1', '2026-04-10'))
    await doses.remove('p1', EARLIER)
    await doses.record(prisePlan('p2', '2026-04-10'))

    await expect(doses.revive('p1', NOW)).resolves.toBe(false)
  })

  it('change la date d’une prise avec l’échéance qu’elle vise et sa prochaine dose', async () => {
    await doses.record(prisePlan('p1', '2026-04-10'))

    await expect(
      doses.changeDate(
        'p1',
        { givenOn: '2026-04-12', dueOn: '2026-04-11', nextDueDate: '2026-05-12' },
        LATER,
      ),
    ).resolves.toBe(true)

    await expect(doses.getById('p1')).resolves.toEqual(
      lue('p1', '2026-04-12', { dueOn: '2026-04-11', nextDueDate: '2026-05-12', updatedAt: LATER }),
    )
  })

  it('ne déplace pas une prise sur le jour d’une autre, ni une prise supprimée', async () => {
    await doses.record(prisePlan('p1', '2026-04-10'))
    await doses.record(prisePlan('p2', '2026-05-10'))
    const dates = { givenOn: '2026-05-10', dueOn: '2026-05-10', nextDueDate: '2026-08-10' }

    await expect(doses.changeDate('p1', dates, LATER)).resolves.toBe(false)
    await doses.remove('p2', NOW)
    await expect(doses.changeDate('p2', dates, LATER)).resolves.toBe(false)
    await expect(doses.changeDate('p1', dates, LATER)).resolves.toBe(true)
  })

  it('laisse la dernière ligne garder sa date et son échéance quand sa prochaine dose change', async () => {
    await doses.record(prisePlan('p1', '2026-04-12', { dueOn: '2026-04-10' }))

    await db.runMany([
      doses.updateHeadStatement(milbemax, { nextDueDate: '2026-09-01', updatedAt: LATER }),
    ])

    await expect(doses.getById('p1')).resolves.toEqual(
      lue('p1', '2026-04-12', { dueOn: '2026-04-10', nextDueDate: '2026-09-01', updatedAt: LATER }),
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
