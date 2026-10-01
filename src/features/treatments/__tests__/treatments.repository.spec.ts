// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
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
import type { Treatment } from '../schema/treatment.schema'

type ImportedTreatment = Omit<Treatment, 'periodId' | 'stoppedOn' | 'deletedAt'> & {
  stoppedOn?: string | null
}

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const ANIMAL_INCONNU = '33333333-3333-4333-8333-333333333333'

const bravecto = {
  animalId: MIETTE,
  name: 'Bravecto',
  type: 'antiparasitic',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-03-01',
} as const

const edition = {
  name: 'Bravecto',
  type: 'antiparasitic',
  frequency: { value: 3, unit: 'month' },
  nextDueDate: '2026-06-01',
} as const

async function seedAnimal(db: InMemoryDb, id: string, name: string) {
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
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
    `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
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

  it('crée un traitement avec son échéance calculée puis le relit à l’identique', async () => {
    const created = await repository.create(bravecto)

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created).toMatchObject({ ...bravecto, nextDueDate: '2026-06-01' })
    expect(created.createdAt).toBe(created.updatedAt)
    expect(created.deletedAt).toBeNull()
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('calcule l’échéance en semaines et en jours, pas en mois', async () => {
    const weekly = await repository.create({
      ...bravecto,
      frequency: { value: 4, unit: 'week' },
    })
    const daily = await repository.create({
      ...bravecto,
      frequency: { value: 15, unit: 'day' },
    })

    expect(weekly.nextDueDate).toBe('2026-03-29')
    expect(daily.nextDueDate).toBe('2026-03-16')
  })

  it('persiste l’échéance en base sans la recalculer à la lecture', async () => {
    const created = await repository.create(bravecto)
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
    await repository.create({ ...bravecto, name: 'Trimestriel' })
    await repository.create({
      ...bravecto,
      name: 'Bimensuel',
      frequency: { value: 15, unit: 'day' },
    })
    await repository.create({ ...bravecto, animalId: VASCO, name: 'Vasco' })
    await repository.create({
      ...bravecto,
      name: 'Mensuel',
      frequency: { value: 1, unit: 'month' },
    })

    const names = (await repository.listByAnimal(MIETTE)).map((treatment) => treatment.name)
    expect(names).toEqual(['Bimensuel', 'Mensuel', 'Trimestriel'])
  })

  it('liste les traitements de tous les animaux, sans les supprimés', async () => {
    await repository.create({ ...bravecto, name: 'Trimestriel' })
    const removed = await repository.create({ ...bravecto, name: 'Supprimé' })
    await repository.create({ ...bravecto, animalId: VASCO, name: 'Vasco' })
    await repository.remove(removed.id)

    const all = await repository.listAll()
    expect(all.map((treatment) => [treatment.animalId, treatment.name])).toEqual([
      [MIETTE, 'Trimestriel'],
      [VASCO, 'Vasco'],
    ])
  })

  it('départage deux échéances identiques par date de saisie, pas par ordre d’insertion', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:01:00.000Z') })
    await repository.create({ ...bravecto, name: 'Second' })
    vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'))
    await repository.create({ ...bravecto, name: 'Premier' })

    const names = (await repository.listByAnimal(MIETTE)).map((treatment) => treatment.name)
    expect(names).toEqual(['Premier', 'Second'])
  })

  it('renvoie une liste vide pour un animal sans traitement', async () => {
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('met à jour le plan et la prochaine dose, rafraîchit updatedAt sans toucher createdAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await repository.create(bravecto)
    vi.advanceTimersByTime(60_000)

    const updated = await repository.update(created.id, {
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 4, unit: 'week' },
      nextDueDate: '2026-03-29',
    })

    expect(updated).toEqual({
      id: created.id,
      animalId: MIETTE,
      name: 'Milbemax',
      type: 'deworming',
      periodId: created.id,
      frequency: { value: 4, unit: 'week' },
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-03-29',
      stoppedOn: null,
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:01:00.000Z',
      deletedAt: null,
    })
    await expect(repository.getById(created.id)).resolves.toEqual(updated)
  })

  it('ne déplace pas un traitement vers un autre animal', async () => {
    const created = await repository.create(bravecto)

    const updated = await repository.update(created.id, {
      ...edition,
      // @ts-expect-error le rattachement est figé : `animalId` n'est pas modifiable
      animalId: VASCO,
    })

    expect(updated.animalId).toBe(MIETTE)
    expect((await repository.listByAnimal(MIETTE)).map((t) => t.id)).toEqual([created.id])
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('échoue à mettre à jour un traitement inexistant', async () => {
    await expect(repository.update('inconnu', edition)).rejects.toThrow(
      'Traitement introuvable : inconnu',
    )
  })

  it('supprime un traitement et laisse les autres intacts', async () => {
    const first = await repository.create(bravecto)
    const second = await repository.create({ ...bravecto, name: 'Milbemax' })

    await repository.remove(first.id)

    await expect(repository.getById(first.id)).resolves.toBeNull()
    expect((await repository.listByAnimal(MIETTE)).map((t) => t.id)).toEqual([second.id])
  })

  it('conserve la ligne supprimée en base avec deleted_at et updated_at renseignés', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await repository.create(bravecto)
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
    const created = await repository.create(bravecto)

    await expect(repository.remove('inconnu')).resolves.toBeUndefined()

    expect((await repository.listByAnimal(MIETTE)).map((t) => t.id)).toEqual([created.id])
  })

  it('ne ressuscite pas un traitement supprimé lors d’une mise à jour', async () => {
    const created = await repository.create(bravecto)
    await repository.remove(created.id)

    await expect(repository.update(created.id, { ...edition, name: 'Autre' })).rejects.toThrow(
      `Traitement introuvable : ${created.id}`,
    )

    const rows = await db.query<Pick<TreatmentRow, 'name' | 'deleted_at'>>(
      'SELECT name, deleted_at FROM treatment WHERE id = ?',
      [created.id],
    )
    expect(rows[0]?.name).toBe('Bravecto')
    expect(rows[0]?.deleted_at).not.toBeNull()
  })

  it('supprimer deux fois le même traitement ne change pas la date de suppression', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await repository.create(bravecto)
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

  it('rejette une fréquence invalide avant d’atteindre la base', async () => {
    await expect(
      repository.create({ ...bravecto, frequency: { value: 0, unit: 'month' } }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      repository.create({ ...bravecto, frequency: { value: 1.5, unit: 'month' } }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
  })

  it('rejette un type hors liste et une date future avant d’atteindre la base', async () => {
    await expect(
      // @ts-expect-error type hors liste
      repository.create({ ...bravecto, type: 'vaccine' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      repository.create({ ...bravecto, lastDoseDate: '2099-01-01' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
  })

  it('refuse un traitement rattaché à un animal inexistant (clé étrangère)', async () => {
    await expect(repository.create({ ...bravecto, animalId: ANIMAL_INCONNU })).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    )

    await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
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
      const created = await repository.create(bravecto)

      const statement = repository.markDeletedByAnimalStatement(MIETTE, '2026-03-01T10:00:00.000Z')

      expect(statement).toEqual({
        sql: 'UPDATE treatment SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND deleted_at IS NULL',
        params: ['2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', MIETTE],
      })
      await expect(repository.getById(created.id)).resolves.toEqual(created)
    })

    it('exécutée via runMany, marque les traitements de l’animal sans toucher aux autres', async () => {
      const miette = await repository.create(bravecto)
      const vasco = await repository.create({ ...bravecto, animalId: VASCO })
      const dejaSupprime = await repository.create({ ...bravecto, name: 'Ancien' })
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

  it('crée le traitement, sa première période et sa première prise, de même identifiant', async () => {
    const created = await repository.create(bravecto)

    expect(created.periodId).toBe(created.id)
    await expect(periodsOf(created.id)).resolves.toEqual([
      {
        id: created.id,
        treatment_id: created.id,
        animal_id: MIETTE,
        starts_on: '2026-03-01',
        first_due_on: '2026-03-01',
        stopped_on: null,
        frequency_value: 3,
        frequency_unit: 'month',
        created_at: created.createdAt,
        updated_at: created.createdAt,
        deleted_at: null,
      },
    ])
    await expect(dosesOf(created.id)).resolves.toEqual([
      {
        id: created.id,
        period_id: created.id,
        treatment_id: created.id,
        animal_id: MIETTE,
        due_on: '2026-03-01',
        due_time: null,
        given_on: '2026-03-01',
        status: 'given',
        next_due_date: '2026-06-01',
        created_at: created.createdAt,
        updated_at: created.createdAt,
        deleted_at: null,
      },
    ])
  })

  it.each([
    ['sa première période', 'treatment_period'],
    ['sa première prise', 'treatment_dose'],
  ])('n’écrit rien quand %s est refusée', async (_, table) => {
    await db.execute(
      `CREATE TRIGGER refuse BEFORE INSERT ON ${table}
       BEGIN SELECT RAISE(ABORT, 'écriture refusée'); END`,
    )

    await expect(repository.create(bravecto)).rejects.toThrow('écriture refusée')

    for (const written of ['treatment', 'treatment_period', 'treatment_dose']) {
      await expect(db.query(`SELECT id FROM ${written}`)).resolves.toEqual([])
    }
  })

  it('prend sa dernière prise et son échéance dans la prise la plus récente', async () => {
    const created = await repository.create(bravecto)

    await addDose(created.id, '2026-06-03', '2026-09-03')

    const attendu = { lastDoseDate: '2026-06-03', nextDueDate: '2026-09-03' }
    await expect(repository.getById(created.id)).resolves.toMatchObject(attendu)
    await expect(repository.listByAnimal(MIETTE)).resolves.toMatchObject([attendu])
    await expect(repository.listAll()).resolves.toMatchObject([attendu])
  })

  it('une prise plus ancienne ajoutée ensuite ne devient pas la tête', async () => {
    const created = await repository.create(bravecto)

    await addDose(created.id, '2025-12-01', '2026-03-01', {
      createdAt: '2099-01-01T00:00:00.000Z',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-06-01',
    })
  })

  it('à date égale, la dernière saisie fait foi, puis le plus grand identifiant', async () => {
    const created = await repository.create({ ...bravecto, lastDoseDate: '2020-01-01' })
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
    const created = await repository.create(bravecto)
    await addDose(created.id, '2026-06-10', '2026-09-10', { dueOn: '2026-06-01' })

    await addDose(created.id, '2026-06-05', '2026-09-05', { dueOn: '2026-06-08' })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-06-05',
      nextDueDate: '2026-09-05',
    })
  })

  it('à échéance égale, une heure passe après une prise sans heure', async () => {
    const created = await repository.create(bravecto)
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

  it('date la dernière ligne de son échéance quand elle n’a pas de date réelle', async () => {
    const created = await repository.create(bravecto)

    await addDose(created.id, '2026-06-01', '2026-09-01', { givenOn: null, status: 'missed' })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-06-01',
      nextDueDate: '2026-09-01',
    })
  })

  it('ignore une prise supprimée : la précédente redevient la tête', async () => {
    const created = await repository.create(bravecto)
    const recente = await addDose(created.id, '2026-06-03', '2026-09-03')

    await db.run('UPDATE treatment_dose SET deleted_at = updated_at WHERE id = ?', [recente])

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-06-01',
    })
  })

  it('lit la fréquence, l’arrêt et l’identifiant de la période en cours', async () => {
    const created = await repository.create(bravecto)
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
    const created = await repository.create(bravecto)
    expect(created.stoppedOn).toBeNull()

    await periods.stop(created.id, '2026-09-01')

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: '2026-09-01',
    })
  })

  it('date sa dernière modification de celle de sa période quand elle est la plus récente', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await repository.create(bravecto)
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
        updatedAt: '2026-09-24T10:01:00.000Z',
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

  it('ne montre pas un traitement sans prise visible, ni sans période', async () => {
    await insertRaw(db, { id: 'sans-prise' })
    await db.runMany([
      periods.insertStatement({
        id: 'sans-prise',
        treatmentId: 'sans-prise',
        animalId: MIETTE,
        startsOn: '2026-03-01',
        firstDueOn: '2026-03-01',
        frequency: { value: 1, unit: 'month' },
        stoppedOn: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
        deletedAt: null,
      }),
    ])
    const sansPeriode = await repository.create(bravecto)
    await db.run('UPDATE treatment_period SET deleted_at = updated_at WHERE id = ?', [
      sansPeriode.id,
    ])

    await expect(repository.getById('sans-prise')).resolves.toBeNull()
    await expect(repository.getById(sansPeriode.id)).resolves.toBeNull()
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
    await expect(repository.listAll()).resolves.toEqual([])
  })

  it('trie les traitements d’un animal par l’échéance de leur tête', async () => {
    const trimestriel = await repository.create({ ...bravecto, name: 'Trimestriel' })
    await repository.create({
      ...bravecto,
      name: 'Mensuel',
      frequency: { value: 1, unit: 'month' },
    })

    await addDose(trimestriel.id, '2026-03-02', '2026-03-20')

    const names = (await repository.listByAnimal(MIETTE)).map(({ name }) => name)
    expect(names).toEqual(['Trimestriel', 'Mensuel'])
  })

  it('la modification corrige la période en cours et la prochaine dose de la dernière prise, pas sa date ni les prises précédentes', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await repository.create(bravecto)
    const ancienne = await addDose(created.id, '2025-12-01', '2026-03-01')
    vi.advanceTimersByTime(60_000)

    await repository.update(created.id, {
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 4, unit: 'week' },
      nextDueDate: '2026-03-29',
    })

    await expect(dosesOf(created.id)).resolves.toEqual([
      expect.objectContaining({
        id: ancienne,
        given_on: '2025-12-01',
        next_due_date: '2026-03-01',
        updated_at: '2026-09-20T10:00:00.000Z',
      }),
      expect.objectContaining({
        id: created.id,
        due_on: '2026-03-01',
        given_on: '2026-03-01',
        next_due_date: '2026-03-29',
        updated_at: '2026-09-24T10:01:00.000Z',
      }),
    ])
    await expect(periodsOf(created.id)).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        starts_on: '2026-03-01',
        first_due_on: '2026-03-01',
        frequency_value: 4,
        frequency_unit: 'week',
        updated_at: '2026-09-24T10:01:00.000Z',
      }),
    ])
    await expect(repository.getById(created.id)).resolves.toMatchObject({
      name: 'Milbemax',
      frequency: { value: 4, unit: 'week' },
      updatedAt: '2026-09-24T10:01:00.000Z',
    })
  })

  it('change la fréquence seule : période et prochaine dose bougent ensemble', async () => {
    const created = await repository.create(bravecto)

    await repository.update(created.id, {
      ...edition,
      frequency: { value: 1, unit: 'month' },
      nextDueDate: '2026-04-01',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      frequency: { value: 1, unit: 'month' },
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-04-01',
    })
  })

  it('reporte seul : la période garde sa fréquence', async () => {
    const created = await repository.create(bravecto)

    await repository.update(created.id, { ...edition, nextDueDate: '2026-06-20' })

    await expect(dosesOf(created.id)).resolves.toMatchObject([
      { given_on: '2026-03-01', next_due_date: '2026-06-20' },
    ])
    await expect(periodsOf(created.id)).resolves.toMatchObject([
      { frequency_value: 3, frequency_unit: 'month' },
    ])
  })

  it('refuse une prochaine dose avant la dernière prise, sans rien écrire', async () => {
    const created = await repository.create(bravecto)

    await expect(
      repository.update(created.id, { ...edition, nextDueDate: '2026-02-28' }),
    ).rejects.toBeInstanceOf(ZodError)

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      nextDueDate: '2026-06-01',
    })
  })

  it.each(['treatment', 'treatment_period', 'treatment_dose'])(
    'n’écrit ni le traitement, ni la période, ni la prise quand l’écriture de %s échoue',
    async (table) => {
      const created = await repository.create(bravecto)
      await db.execute(
        `CREATE TRIGGER refuse_modification BEFORE UPDATE ON ${table}
         BEGIN SELECT RAISE(ABORT, 'ligne verrouillée'); END`,
      )

      await expect(
        repository.update(created.id, {
          ...edition,
          name: 'Autre',
          frequency: { value: 1, unit: 'month' },
        }),
      ).rejects.toThrow('ligne verrouillée')

      await expect(repository.getById(created.id)).resolves.toMatchObject({
        name: 'Bravecto',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-06-01',
      })
    },
  )

  it('supprimer un traitement pose sa date de suppression sur ses périodes et ses prises', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await repository.create(bravecto)
    await addDose(created.id, '2025-12-01', '2026-03-01')
    const autre = await repository.create({ ...bravecto, name: 'Milbemax' })
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
    const created = await repository.create(bravecto)
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

  it('liste les prises visibles d’un traitement, la plus récente d’abord', async () => {
    const created = await repository.create(bravecto)
    const ancienne = await addDose(created.id, '2025-12-01', '2026-03-01')

    const liste = await repository.listDoses(created.id)

    expect(liste.map(({ id }) => id)).toEqual([created.id, ancienne])
  })

  it('compte les prises de chaque traitement d’un animal', async () => {
    const created = await repository.create(bravecto)
    await addDose(created.id, '2025-12-01', '2026-03-01')
    const autre = await repository.create({ ...bravecto, name: 'Milbemax' })

    await expect(repository.countDosesByAnimal(MIETTE)).resolves.toEqual({
      [created.id]: 2,
      [autre.id]: 1,
    })
  })

  it('reprend un traitement arrêté : période en cours remise en route, prochaine dose sur la dernière prise', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await repository.create(bravecto)
    const ancienne = await addDose(created.id, '2025-12-01', '2026-03-01')
    await periods.stop(created.id, '2026-05-26')
    vi.advanceTimersByTime(60_000)

    await repository.resume(created.id, {
      ...edition,
      frequency: { value: 1, unit: 'month' },
      nextDueDate: '2026-10-01',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: null,
      frequency: { value: 1, unit: 'month' },
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-10-01',
      updatedAt: '2026-09-24T10:01:00.000Z',
    })
    await expect(dosesOf(created.id)).resolves.toEqual([
      expect.objectContaining({ id: ancienne, next_due_date: '2026-03-01' }),
      expect.objectContaining({
        id: created.id,
        next_due_date: '2026-10-01',
        updated_at: '2026-09-24T10:01:00.000Z',
      }),
    ])
    await expect(periodsOf(created.id)).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        stopped_on: null,
        frequency_value: 1,
        frequency_unit: 'month',
        updated_at: '2026-09-24T10:01:00.000Z',
      }),
    ])
  })

  it('ne reprend pas un traitement avec une prochaine dose avant sa dernière prise', async () => {
    const created = await repository.create(bravecto)
    await periods.stop(created.id, '2026-05-26')

    await expect(
      repository.resume(created.id, { ...edition, nextDueDate: '2026-02-28' }),
    ).rejects.toBeInstanceOf(ZodError)

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: '2026-05-26',
    })
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

  function restore(treatment: ImportedTreatment, exists: boolean) {
    return db.runMany([
      repository.restoreStatement(treatment, exists),
      periods.restoreStatement({
        id: treatment.id,
        treatmentId: treatment.id,
        animalId: treatment.animalId,
        startsOn: treatment.lastDoseDate,
        firstDueOn: treatment.lastDoseDate,
        frequency: treatment.frequency,
        stoppedOn: treatment.stoppedOn ?? null,
        createdAt: treatment.createdAt,
        updatedAt: treatment.updatedAt,
      }),
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
    const vivant = await repository.create(bravecto)
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
