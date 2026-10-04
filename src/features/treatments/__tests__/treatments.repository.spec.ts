// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import {
  createTreatmentDosesRepository,
  type TreatmentDosesRepository,
} from '../repository/treatment-doses.repository'
import {
  createTreatmentPeriodsRepository,
  type TreatmentPeriodsRepository,
} from '../repository/treatment-periods.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Treatment } from '../schema/treatment.schema'
import { seedTreatmentWithDose } from './seed-treatment'

type ImportedTreatment = Omit<
  Treatment,
  'periodId' | 'lastDoseDate' | 'stoppedOn' | 'deletedAt'
> & {
  lastDoseDate: string
  stoppedOn?: string | null
}

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'

const bravecto = {
  animalId: MIETTE,
  name: 'Bravecto',
  type: 'antiparasitic',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-03-01',
} as const

async function seedAnimal(db: InMemoryDb, id: string, name: string) {
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
     VALUES (?, ?, ?, ?, ?, 'appareil-test', 'appareil-test')`,
    [id, name, 'cat', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  )
}

interface TreatmentRow {
  id: string
  name: string
  type: string
  deleted_at: string | null
  updated_at: string
}

async function insertRaw(db: InMemoryDb, overrides: Partial<Record<string, string | number>>) {
  const row = {
    id: crypto.randomUUID(),
    animal_id: MIETTE,
    name: 'Brut',
    type: 'deworming',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
  await db.run(
    `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at, created_by_device, updated_by_device)
     VALUES (?, ?, ?, ?, ?, ?, 'appareil-test', 'appareil-test')`,
    Object.values(row),
  )
}

describe('treatmentsRepository', () => {
  let db: InMemoryDb
  let repository: TreatmentsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    // sql.js désactive les clés étrangères par défaut, contrairement au plugin Capacitor.
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createTreatmentsRepository(db)
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it('persiste l’échéance en base sans la recalculer à la lecture', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)
    await db.run('UPDATE treatment_dose SET next_due_date = ? WHERE treatment_id = ?', [
      '2030-01-01',
      created.id,
    ])

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      nextDueDate: '2030-01-01',
    })
  })

  it('renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getById('inconnu')).resolves.toBeNull()
  })

  it('liste les traitements d’un animal par échéance croissante', async () => {
    await seedTreatmentWithDose(db, { ...bravecto, name: 'Trimestriel' })
    await seedTreatmentWithDose(db, {
      ...bravecto,
      name: 'Bimensuel',
      frequency: { value: 15, unit: 'day' },
    })
    await seedTreatmentWithDose(db, { ...bravecto, animalId: VASCO, name: 'Vasco' })
    await seedTreatmentWithDose(db, {
      ...bravecto,
      name: 'Mensuel',
      frequency: { value: 1, unit: 'month' },
    })

    const names = (await repository.listByAnimal(MIETTE)).map((treatment) => treatment.name)
    expect(names).toEqual(['Bimensuel', 'Mensuel', 'Trimestriel'])
  })

  it('liste les traitements de tous les animaux, sans les supprimés', async () => {
    await seedTreatmentWithDose(db, { ...bravecto, name: 'Trimestriel' })
    const removed = await seedTreatmentWithDose(db, { ...bravecto, name: 'Supprimé' })
    await seedTreatmentWithDose(db, { ...bravecto, animalId: VASCO, name: 'Vasco' })
    await repository.remove(removed.id)

    const all = await repository.listAll()
    expect(all.map((treatment) => [treatment.animalId, treatment.name])).toEqual([
      [MIETTE, 'Trimestriel'],
      [VASCO, 'Vasco'],
    ])
  })

  it('départage deux échéances identiques par date de saisie, pas par ordre d’insertion', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:01:00.000Z') })
    await seedTreatmentWithDose(db, { ...bravecto, name: 'Second' })
    vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'))
    await seedTreatmentWithDose(db, { ...bravecto, name: 'Premier' })

    const names = (await repository.listByAnimal(MIETTE)).map((treatment) => treatment.name)
    expect(names).toEqual(['Premier', 'Second'])
  })

  it('renvoie une liste vide pour un animal sans traitement', async () => {
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('supprime un traitement et laisse les autres intacts', async () => {
    const first = await seedTreatmentWithDose(db, bravecto)
    const second = await seedTreatmentWithDose(db, { ...bravecto, name: 'Milbemax' })

    await repository.remove(first.id)

    await expect(repository.getById(first.id)).resolves.toBeNull()
    expect((await repository.listByAnimal(MIETTE)).map((t) => t.id)).toEqual([second.id])
  })

  it('conserve la ligne supprimée en base avec deleted_at et updated_at renseignés', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await seedTreatmentWithDose(db, bravecto)
    vi.advanceTimersByTime(60_000)

    await repository.remove(created.id)

    const rows = await db.query<Pick<TreatmentRow, 'id' | 'deleted_at' | 'updated_at'>>(
      'SELECT id, deleted_at, updated_at FROM treatment WHERE id = ?',
      [created.id],
    )
    expect(rows).toEqual([
      {
        id: created.id,
        deleted_at: '2026-03-01T10:01:00.000Z',
        updated_at: '2026-03-01T10:01:00.000Z',
      },
    ])
  })

  it('ne casse rien quand on supprime un identifiant inconnu', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)

    await expect(repository.remove('inconnu')).resolves.toBeTypeOf('string')

    expect((await repository.listByAnimal(MIETTE)).map((t) => t.id)).toEqual([created.id])
  })

  it('supprimer deux fois le même traitement ne change pas la date de suppression', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await seedTreatmentWithDose(db, bravecto)
    await repository.remove(created.id)
    vi.advanceTimersByTime(60_000)

    await repository.remove(created.id)

    const rows = await db.query<Pick<TreatmentRow, 'deleted_at' | 'updated_at'>>(
      'SELECT deleted_at, updated_at FROM treatment WHERE id = ?',
      [created.id],
    )
    expect(rows).toEqual([
      { deleted_at: '2026-03-01T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' },
    ])
  })

  describe('table treatment', () => {
    it('expose les colonnes attendues, rattachées à animal en cascade', async () => {
      const columns = await db.query<{ name: string; type: string; notnull: number; pk: number }>(
        'PRAGMA table_info(treatment)',
      )
      expect(columns.map((column) => column.name)).toEqual([
        'id',
        'animal_id',
        'name',
        'type',
        'created_at',
        'updated_at',
        'deleted_at',
        'created_by_device',
        'updated_by_device',
      ])
      expect(columns.find((column) => column.name === 'id')?.pk).toBe(1)
      expect(columns.find((column) => column.name === 'deleted_at')?.notnull).toBe(0)

      const foreignKeys = await db.query<{ table: string; from: string; on_delete: string }>(
        'PRAGMA foreign_key_list(treatment)',
      )
      expect(foreignKeys).toMatchObject([
        { table: 'animal', from: 'animal_id', on_delete: 'CASCADE' },
      ])
    })

    it('est indexée par animal', async () => {
      const indexes = await db.query<{ name: string }>('PRAGMA index_list(treatment)')
      expect(indexes.map((index) => index.name)).toContain('idx_treatment_animal_id')
    })

    it('refuse en base un type hors liste', async () => {
      await expect(insertRaw(db, { type: 'vaccine' })).rejects.toThrow(/type not allowed/)
    })
  })

  describe('markDeletedByAnimalStatement', () => {
    it('construit l’instruction sans l’exécuter', async () => {
      const created = await seedTreatmentWithDose(db, bravecto)

      const statement = repository.markDeletedByAnimalStatement(MIETTE, '2026-03-01T10:00:00.000Z')

      expect(statement.sql).toMatch(/^UPDATE treatment SET deleted_at = \?/)
      expect(statement.params).toEqual([
        '2026-03-01T10:00:00.000Z',
        '2026-03-01T10:00:00.000Z',
        expect.any(String),
        MIETTE,
      ])
      await expect(repository.getById(created.id)).resolves.toEqual(created)
    })

    it('exécutée via runMany, marque les traitements de l’animal sans toucher aux autres', async () => {
      const miette = await seedTreatmentWithDose(db, bravecto)
      const vasco = await seedTreatmentWithDose(db, { ...bravecto, animalId: VASCO })
      const dejaSupprime = await seedTreatmentWithDose(db, { ...bravecto, name: 'Ancien' })
      await repository.remove(dejaSupprime.id)

      await db.runMany([
        repository.markDeletedByAnimalStatement(MIETTE, '2026-03-01T10:00:00.000Z'),
      ])

      await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
      await expect(repository.getById(vasco.id)).resolves.toEqual(vasco)
      const rows = await db.query<Pick<TreatmentRow, 'id' | 'deleted_at'>>(
        'SELECT id, deleted_at FROM treatment WHERE animal_id = ?',
        [MIETTE],
      )
      expect(rows.find((row) => row.id === miette.id)?.deleted_at).toBe('2026-03-01T10:00:00.000Z')
      expect(rows.find((row) => row.id === dejaSupprime.id)?.deleted_at).not.toBe(
        '2026-03-01T10:00:00.000Z',
      )
    })
  })
})

describe('treatmentsRepository — périodes et prises', () => {
  let db: InMemoryDb
  let repository: TreatmentsRepository
  let periods: TreatmentPeriodsRepository
  let doses: TreatmentDosesRepository

  interface DoseRow {
    id: string
    period_id: string
    treatment_id: string
    animal_id: string
    due_on: string
    due_time: string | null
    given_on: string | null
    status: string
    next_due_date: string
    created_at: string
    updated_at: string
    deleted_at: string | null
  }

  interface PeriodRow {
    id: string
    treatment_id: string
    animal_id: string
    starts_on: string
    first_due_on: string
    stopped_on: string | null
    frequency_value: number
    frequency_unit: string
    created_at: string
    updated_at: string
    deleted_at: string | null
  }

  async function addDose(
    treatmentId: string,
    givenOn: string,
    nextDueDate: string,
    {
      createdAt = '2026-09-20T10:00:00.000Z',
      id = crypto.randomUUID(),
      ...surcharges
    }: Partial<NewTreatmentDose> = {},
  ): Promise<string> {
    await db.runMany([
      doses.insertStatement({
        id,
        periodId: treatmentId,
        treatmentId,
        animalId: MIETTE,
        dueOn: givenOn,
        dueTime: null,
        givenOn,
        status: 'given',
        nextDueDate,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
        ...surcharges,
      }),
    ])
    return id
  }

  function dosesOf(treatmentId: string): Promise<DoseRow[]> {
    return db.query<DoseRow>(
      'SELECT * FROM treatment_dose WHERE treatment_id = ? ORDER BY due_on',
      [treatmentId],
    )
  }

  function periodsOf(treatmentId: string): Promise<PeriodRow[]> {
    return db.query<PeriodRow>(
      `SELECT id, treatment_id, animal_id, starts_on, first_due_on, stopped_on, frequency_value,
              frequency_unit, created_at, updated_at, deleted_at
       FROM treatment_period WHERE treatment_id = ? ORDER BY starts_on`,
      [treatmentId],
    )
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createTreatmentsRepository(db)
    periods = createTreatmentPeriodsRepository(db)
    doses = createTreatmentDosesRepository(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('prend sa dernière prise et son échéance dans la prise la plus récente', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)

    await addDose(created.id, '2026-06-03', '2026-09-03')

    const attendu = { lastDoseDate: '2026-06-03', nextDueDate: '2026-09-03' }
    await expect(repository.getById(created.id)).resolves.toMatchObject(attendu)
    await expect(repository.listByAnimal(MIETTE)).resolves.toMatchObject([attendu])
    await expect(repository.listAll()).resolves.toMatchObject([attendu])
  })

  it('une prise plus ancienne ajoutée ensuite ne devient pas la tête', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)

    await addDose(created.id, '2025-12-01', '2026-03-01', {
      createdAt: '2099-01-01T00:00:00.000Z',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-06-01',
    })
  })

  it('à date égale, la dernière saisie fait foi, puis le plus grand identifiant', async () => {
    const created = await seedTreatmentWithDose(db, { ...bravecto, lastDoseDate: '2020-01-01' })
    await addDose(created.id, '2026-01-10', '2026-04-10', {
      createdAt: '2026-01-10T11:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000000',
    })
    await addDose(created.id, '2026-01-10', '2026-05-10', {
      createdAt: '2026-01-10T10:00:00.000Z',
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      nextDueDate: '2026-04-10',
    })

    await addDose(created.id, '2026-01-10', '2026-06-10', {
      createdAt: '2026-01-10T11:00:00.000Z',
      id: '11111111-0000-4000-8000-000000000000',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      nextDueDate: '2026-06-10',
    })
  })

  it('la dernière ligne est celle de la dernière échéance, pas de la date réelle la plus tardive', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)
    await addDose(created.id, '2026-06-10', '2026-09-10', { dueOn: '2026-06-01' })

    await addDose(created.id, '2026-06-05', '2026-09-05', { dueOn: '2026-06-08' })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-06-05',
      nextDueDate: '2026-09-05',
    })
  })

  it('à échéance égale, une heure passe après une prise sans heure', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)
    await addDose(created.id, '2026-06-01', '2026-06-01', {
      dueTime: '20:00',
      createdAt: '2026-06-01T08:00:00.000Z',
    })
    await addDose(created.id, '2026-06-01', '2026-09-01', {
      createdAt: '2026-06-01T09:00:00.000Z',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      nextDueDate: '2026-06-01',
    })
  })

  it('une dernière ligne oubliée ou reportée fixe la prochaine dose, pas la dernière prise', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)

    await addDose(created.id, '2026-06-01', '2026-09-01', { givenOn: null, status: 'missed' })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-09-01',
    })
  })

  it('une ligne de décalage n’est jamais la tête : la prise de la même échéance la reste', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)

    await addDose(created.id, '2026-06-01', '2026-09-03', { givenOn: '2026-06-03' })
    await addDose(created.id, '2026-06-01', '2026-06-03', { givenOn: null, status: 'shift' })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-06-03',
      nextDueDate: '2026-09-03',
    })
  })

  it('sans prise donnée, une ligne reportée ne donne aucune dernière prise', async () => {
    await addWithoutDose('reporte', '2026-03-05')

    await addDose('reporte', '2026-03-05', '2026-03-12', { givenOn: null, status: 'postponed' })

    await expect(repository.getById('reporte')).resolves.toMatchObject({
      lastDoseDate: null,
      nextDueDate: '2026-03-12',
    })
  })

  describe('traitement repris dans une nouvelle période', () => {
    const SECONDE = 'seconde-periode'

    async function reprise(overrides: Partial<TreatmentPeriodRecord> = {}): Promise<string> {
      const created = await seedTreatmentWithDose(db, { ...bravecto, lastDoseDate: '2026-09-01' })
      await addDose(created.id, '2026-09-15', '2026-09-22')
      await periods.stop(created.id, '2026-09-21')
      await db.runMany([
        periods.insertStatement({
          id: SECONDE,
          treatmentId: created.id,
          animalId: MIETTE,
          startsOn: '2026-09-28',
          firstDueOn: '2026-10-05',
          frequency: { value: 1, unit: 'week' },
          stoppedOn: null,
          createdAt: '2026-09-28T10:00:00.000Z',
          updatedAt: '2026-09-28T10:00:00.000Z',
          deletedAt: null,
          ...overrides,
        }),
      ])
      return created.id
    }

    it('lit la tête dans la période en cours : sans prise, sa première échéance', async () => {
      const id = await reprise()

      await expect(repository.getById(id)).resolves.toMatchObject({
        periodId: SECONDE,
        lastDoseDate: null,
        nextDueDate: '2026-10-05',
      })
      await expect(repository.listByAnimal(MIETTE)).resolves.toMatchObject([
        { lastDoseDate: null, nextDueDate: '2026-10-05' },
      ])
    })

    it('lit la dernière prise de la période en cours, pas une échéance plus tardive d’avant', async () => {
      const id = await reprise()
      await addDose(id, '2026-10-05', '2026-10-12', { periodId: SECONDE })
      await addDose(id, '2026-11-01', '2026-12-01')

      await expect(repository.getById(id)).resolves.toMatchObject({
        lastDoseDate: '2026-10-05',
        nextDueDate: '2026-10-12',
      })
    })

    it('ne prend jamais pour tête une prise d’une période supprimée', async () => {
      const id = await reprise()
      await db.run('UPDATE treatment_period SET deleted_at = updated_at WHERE id = ?', [id])

      await expect(repository.getById(id)).resolves.toMatchObject({
        periodId: SECONDE,
        lastDoseDate: null,
        nextDueDate: '2026-10-05',
      })
    })
  })

  it('ignore une prise supprimée : la précédente redevient la tête', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)
    const recente = await addDose(created.id, '2026-06-03', '2026-09-03')

    await db.run('UPDATE treatment_dose SET deleted_at = updated_at WHERE id = ?', [recente])

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-06-01',
    })
  })

  it('lit la fréquence, l’arrêt et l’identifiant de la période en cours', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)
    const reprise = crypto.randomUUID()
    await db.runMany([
      periods.insertStatement({
        id: reprise,
        treatmentId: created.id,
        animalId: MIETTE,
        startsOn: '2026-05-01',
        firstDueOn: '2026-05-01',
        frequency: { value: 2, unit: 'week' },
        stoppedOn: '2026-09-01',
        createdAt: created.createdAt,
        updatedAt: created.createdAt,
        deletedAt: null,
      }),
    ])

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      periodId: reprise,
      frequency: { value: 2, unit: 'week' },
      stoppedOn: '2026-09-01',
    })
  })

  it('lit l’arrêt de la période en cours', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)
    expect(created.stoppedOn).toBeNull()

    await periods.stop(created.id, '2026-09-01')

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: '2026-09-01',
    })
  })

  it('date sa dernière modification de celle de sa période quand elle est la plus récente', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await seedTreatmentWithDose(db, bravecto)
    vi.advanceTimersByTime(60_000)

    await periods.stop(created.id, '2026-09-24')

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: '2026-09-24',
      updatedAt: '2026-09-24T10:01:00.000Z',
    })
    await expect(repository.listVersions()).resolves.toEqual([
      {
        id: created.id,
        animalId: MIETTE,
        updatedAt: '2026-09-24T10:00:00.000Z',
        deletedAt: null,
      },
    ])

    vi.advanceTimersByTime(60_000)
    await periods.undoStop(created.id)

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: null,
      updatedAt: '2026-09-24T10:02:00.000Z',
    })
  })

  async function addWithoutDose(id: string, firstDueOn: string, animalId = MIETTE) {
    await insertRaw(db, { id, animal_id: animalId, name: id })
    await db.runMany([
      periods.insertStatement({
        id,
        treatmentId: id,
        animalId,
        startsOn: '2026-03-01',
        firstDueOn,
        frequency: { value: 1, unit: 'month' },
        stoppedOn: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        deletedAt: null,
      }),
    ])
  }

  it('montre un traitement sans prise : aucune dernière prise, prochaine dose à sa première échéance', async () => {
    await addWithoutDose('sans-prise', '2026-03-05')

    const expected = {
      id: 'sans-prise',
      periodId: 'sans-prise',
      frequency: { value: 1, unit: 'month' },
      lastDoseDate: null,
      nextDueDate: '2026-03-05',
      stoppedOn: null,
    }
    await expect(repository.getById('sans-prise')).resolves.toMatchObject(expected)
    await expect(repository.listByAnimal(MIETTE)).resolves.toMatchObject([expected])
    await expect(repository.listAll()).resolves.toMatchObject([expected])
  })

  it('range un traitement sans prise à sa première échéance, parmi les autres', async () => {
    await seedTreatmentWithDose(db, { ...bravecto, name: 'Juin' })
    await addWithoutDose('Avril', '2026-04-10')
    await addWithoutDose('Juillet', '2026-07-10')

    const names = (await repository.listByAnimal(MIETTE)).map(({ name }) => name)
    expect(names).toEqual(['Avril', 'Juin', 'Juillet'])
    expect((await repository.listAll()).map(({ name }) => name)).toEqual(names)
  })

  it('un traitement dont la seule prise est supprimée retombe sur sa première échéance', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)
    await db.run('UPDATE treatment_dose SET deleted_at = updated_at WHERE treatment_id = ?', [
      created.id,
    ])

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: null,
      nextDueDate: bravecto.lastDoseDate,
    })
  })

  it('ne montre pas un traitement sans période', async () => {
    const sansPeriode = await seedTreatmentWithDose(db, bravecto)
    await db.run('UPDATE treatment_period SET deleted_at = updated_at WHERE id = ?', [
      sansPeriode.id,
    ])

    await expect(repository.getById(sansPeriode.id)).resolves.toBeNull()
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
    await expect(repository.listAll()).resolves.toEqual([])
  })

  it('trie les traitements d’un animal par l’échéance de leur tête', async () => {
    const trimestriel = await seedTreatmentWithDose(db, { ...bravecto, name: 'Trimestriel' })
    await seedTreatmentWithDose(db, {
      ...bravecto,
      name: 'Mensuel',
      frequency: { value: 1, unit: 'month' },
    })

    await addDose(trimestriel.id, '2026-03-02', '2026-03-20')

    const names = (await repository.listByAnimal(MIETTE)).map(({ name }) => name)
    expect(names).toEqual(['Trimestriel', 'Mensuel'])
  })

  it('supprimer un traitement pose sa date de suppression sur ses périodes et ses prises', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await seedTreatmentWithDose(db, bravecto)
    await addDose(created.id, '2025-12-01', '2026-03-01')
    const autre = await seedTreatmentWithDose(db, { ...bravecto, name: 'Milbemax' })
    vi.advanceTimersByTime(60_000)

    await repository.remove(created.id)

    const tombstone = {
      deleted_at: '2026-09-24T10:01:00.000Z',
      updated_at: '2026-09-24T10:01:00.000Z',
    }
    await expect(dosesOf(created.id)).resolves.toMatchObject([tombstone, tombstone])
    await expect(periodsOf(created.id)).resolves.toMatchObject([tombstone])
    await expect(dosesOf(autre.id)).resolves.toMatchObject([{ deleted_at: null }])
    await expect(periodsOf(autre.id)).resolves.toMatchObject([{ deleted_at: null }])
  })

  it('supprimer deux fois un traitement ne change pas la date de ses périodes ni de ses prises', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await seedTreatmentWithDose(db, bravecto)
    await repository.remove(created.id)
    const [prisesAvant, periodesAvant] = await Promise.all([
      dosesOf(created.id),
      periodsOf(created.id),
    ])
    vi.advanceTimersByTime(60_000)

    await repository.remove(created.id)

    await expect(dosesOf(created.id)).resolves.toEqual(prisesAvant)
    await expect(periodsOf(created.id)).resolves.toEqual(periodesAvant)
  })

  describe('rétablir un traitement supprimé', () => {
    const REMOVED_AT = '2026-09-24T10:01:00.000Z'
    const UNDONE_AT = '2026-09-24T10:01:03.000Z'
    const back = { deleted_at: null, updated_at: UNDONE_AT }

    async function removeThenWait(id: string): Promise<string> {
      vi.setSystemTime(new Date(REMOVED_AT))
      const deletedAt = await repository.remove(id)
      vi.setSystemTime(new Date(UNDONE_AT))
      return deletedAt
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-24T10:00:00.000Z') })
    })

    it('rend visibles le traitement, ses périodes et ses prises, datés de l’annulation', async () => {
      const created = await seedTreatmentWithDose(db, bravecto)
      await addDose(created.id, '2025-12-01', '2026-03-01')
      const deletedAt = await removeThenWait(created.id)

      await repository.restore(created.id, deletedAt)

      expect(deletedAt).toBe(REMOVED_AT)
      await expect(repository.getWithHistory(created.id)).resolves.toMatchObject({
        id: created.id,
        updatedAt: UNDONE_AT,
        periods: [{ id: created.id }],
        doses: [{ dueOn: '2026-03-01' }, { dueOn: '2025-12-01' }],
      })
      await expect(dosesOf(created.id)).resolves.toMatchObject([back, back])
      await expect(periodsOf(created.id)).resolves.toMatchObject([back])
    })

    it('laisse supprimée une prise supprimée avant le traitement', async () => {
      const created = await seedTreatmentWithDose(db, bravecto)
      const ancienne = await addDose(created.id, '2025-12-01', '2026-03-01')
      await doses.applyBatch([{ action: 'delete', id: ancienne }], '2026-09-24T09:00:00.000Z')
      const deletedAt = await removeThenWait(created.id)

      await repository.restore(created.id, deletedAt)

      await expect(dosesOf(created.id)).resolves.toMatchObject([
        { id: ancienne, deleted_at: '2026-09-24T09:00:00.000Z' },
        { id: created.id, ...back },
      ])
    })

    it('ne touche ni un autre traitement, ni une suppression d’un autre instant', async () => {
      const created = await seedTreatmentWithDose(db, bravecto)
      const autre = await seedTreatmentWithDose(db, { ...bravecto, name: 'Milbemax' })
      const deletedAt = await removeThenWait(created.id)
      await repository.remove(autre.id)

      await repository.restore(autre.id, deletedAt)
      await repository.restore(created.id, '2026-09-24T10:00:59.000Z')

      await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
      await expect(periodsOf(created.id)).resolves.toMatchObject([{ deleted_at: REMOVED_AT }])
    })

    it('rend l’instant d’une suppression sans effet, qui ne rétablit rien', async () => {
      const created = await seedTreatmentWithDose(db, bravecto)
      await removeThenWait(created.id)

      const again = await repository.remove(created.id)
      await repository.restore(created.id, again)

      expect(again).toBe(UNDONE_AT)
      await expect(repository.getWithHistory(created.id)).resolves.toBeNull()
    })
  })

  it('liste les prises visibles d’un traitement, la plus récente d’abord', async () => {
    const created = await seedTreatmentWithDose(db, bravecto)
    const ancienne = await addDose(created.id, '2025-12-01', '2026-03-01')

    const liste = await repository.listDoses(created.id)

    expect(liste.map(({ id }) => id)).toEqual([created.id, ancienne])
  })
})

describe('treatmentsRepository — import', () => {
  const IMPORTE: ImportedTreatment = {
    id: '44444444-4444-4444-8444-444444444444',
    animalId: MIETTE,
    name: 'Milbémax',
    type: 'deworming',
    frequency: { value: 3, unit: 'month' },
    lastDoseDate: '2026-06-15',
    nextDueDate: '2026-09-15',
    createdAt: '2026-01-10T08:10:00.000Z',
    updatedAt: '2026-06-15T08:10:00.000Z',
  }

  let db: InMemoryDb
  let repository: TreatmentsRepository
  let periods: TreatmentPeriodsRepository
  let doses: TreatmentDosesRepository

  const PAR_FICHIER = {
    createdByDevice: 'appareil-du-fichier',
    updatedByDevice: 'appareil-du-fichier',
  }

  function restore(treatment: ImportedTreatment, exists: boolean) {
    return db.runMany([
      repository.restoreStatement({ ...treatment, ...PAR_FICHIER }, exists),
      periods.restoreStatement(
        {
          id: treatment.id,
          treatmentId: treatment.id,
          animalId: treatment.animalId,
          startsOn: treatment.lastDoseDate,
          firstDueOn: treatment.lastDoseDate,
          referenceOn: treatment.lastDoseDate,
          endsOn: null,
          frequency: treatment.frequency,
          stoppedOn: treatment.stoppedOn ?? null,
          times: [],
          doseQuantity: null,
          doseUnit: null,
          reminderOffsetMinutes: null,
          reminderTime: null,
          createdAt: treatment.createdAt,
          updatedAt: treatment.updatedAt,
          ...PAR_FICHIER,
        },
        exists,
      ),
      doses.restoreStatement(
        {
          id: treatment.id,
          periodId: treatment.id,
          treatmentId: treatment.id,
          animalId: treatment.animalId,
          dueOn: treatment.lastDoseDate,
          dueTime: null,
          givenOn: treatment.lastDoseDate,
          status: 'given',
          nextDueDate: treatment.nextDueDate,
          createdAt: treatment.createdAt,
          updatedAt: treatment.updatedAt,
          ...PAR_FICHIER,
        },
        exists,
      ),
    ])
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createTreatmentsRepository(db)
    periods = createTreatmentPeriodsRepository(db)
    doses = createTreatmentDosesRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('insère un traitement importé avec son échéance et ses dates d’origine', async () => {
    await restore(IMPORTE, false)

    await expect(repository.getById(IMPORTE.id)).resolves.toEqual({
      ...IMPORTE,
      periodId: IMPORTE.id,
      stoppedOn: null,
      deletedAt: null,
    })
  })

  it('écrase un traitement existant, même supprimé, et le rend visible', async () => {
    await restore(IMPORTE, false)
    await repository.remove(IMPORTE.id)
    const importe: ImportedTreatment = {
      ...IMPORTE,
      type: 'antiparasitic',
      frequency: { value: 2, unit: 'week' },
      nextDueDate: '2026-07-15',
      updatedAt: '2026-09-15T08:00:00.000Z',
    }

    await restore(importe, true)

    await expect(repository.getById(IMPORTE.id)).resolves.toEqual({
      ...importe,
      periodId: IMPORTE.id,
      stoppedOn: null,
      deletedAt: null,
    })
  })

  it('garde l’arrêt du fichier, à l’insertion comme à l’écrasement', async () => {
    await restore({ ...IMPORTE, stoppedOn: '2026-08-01' }, false)
    await expect(repository.getById(IMPORTE.id)).resolves.toMatchObject({
      stoppedOn: '2026-08-01',
    })

    await restore({ ...IMPORTE, stoppedOn: '2026-09-01' }, true)
    await expect(repository.getById(IMPORTE.id)).resolves.toMatchObject({
      stoppedOn: '2026-09-01',
    })

    await restore({ ...IMPORTE, stoppedOn: null }, true)
    await expect(repository.getById(IMPORTE.id)).resolves.toMatchObject({ stoppedOn: null })
  })

  it('remet en cours un traitement dont le fichier ne porte pas d’arrêt', async () => {
    await restore({ ...IMPORTE, stoppedOn: '2026-08-01' }, false)

    await restore(IMPORTE, true)

    await expect(repository.getById(IMPORTE.id)).resolves.toMatchObject({ stoppedOn: null })
  })

  it('ne déplace pas un traitement existant vers l’animal du fichier', async () => {
    await restore(IMPORTE, false)

    await restore({ ...IMPORTE, animalId: VASCO }, true)

    await expect(repository.getById(IMPORTE.id)).resolves.toMatchObject({
      animalId: IMPORTE.animalId,
    })
    await expect(
      db.query('SELECT animal_id FROM treatment_dose WHERE id = ?', [IMPORTE.id]),
    ).resolves.toEqual([{ animal_id: MIETTE }])
  })

  it('liste les versions de toutes les lignes, supprimées comprises', async () => {
    const vivant = await seedTreatmentWithDose(db, bravecto)
    await restore(IMPORTE, false)
    await repository.remove(IMPORTE.id)

    const versions = await repository.listVersions()

    expect(versions).toHaveLength(2)
    expect(versions).toContainEqual({
      id: vivant.id,
      animalId: MIETTE,
      updatedAt: vivant.updatedAt,
      deletedAt: null,
    })
    expect(versions.find(({ id }) => id === IMPORTE.id)?.deletedAt).not.toBeNull()
  })

  it('liste les lignes à exporter telles que la table les enregistre, sans les supprimées', async () => {
    const vivant = await seedTreatmentWithDose(db, bravecto)
    await restore(IMPORTE, false)
    await repository.remove(IMPORTE.id)
    await db.run('UPDATE treatment_dose SET deleted_at = ? WHERE treatment_id = ?', [
      '2026-09-01T00:00:00.000Z',
      vivant.id,
    ])

    await expect(repository.listRecords()).resolves.toEqual([
      {
        id: vivant.id,
        animalId: MIETTE,
        name: vivant.name,
        type: vivant.type,
        createdAt: vivant.createdAt,
        updatedAt: vivant.updatedAt,
        createdByDevice: expect.any(String),
        updatedByDevice: expect.any(String),
      },
    ])
  })

  it('marque tous les traitements encore visibles', async () => {
    await restore(IMPORTE, false)
    await db.runMany([repository.markAllDeletedStatement('2030-01-01T09:00:00.000Z')])

    await expect(repository.listVersions()).resolves.toEqual([
      {
        id: IMPORTE.id,
        animalId: MIETTE,
        updatedAt: '2030-01-01T09:00:00.000Z',
        deletedAt: '2030-01-01T09:00:00.000Z',
      },
    ])
  })
})
