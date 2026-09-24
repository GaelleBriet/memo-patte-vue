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
import type { ExportTreatment } from '@/shared/domain/carnet-data'

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
  frequency_value: number
  frequency_unit: string
  deleted_at: string | null
  updated_at: string
}

async function insertRaw(db: InMemoryDb, overrides: Partial<Record<string, string | number>>) {
  const row = {
    id: crypto.randomUUID(),
    animal_id: MIETTE,
    name: 'Brut',
    type: 'deworming',
    frequency_value: 1,
    frequency_unit: 'month',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
  await db.run(
    `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        'frequency_value',
        'frequency_unit',
        'stopped_on',
        'created_at',
        'updated_at',
        'deleted_at',
      ])
      expect(columns.find((column) => column.name === 'id')?.pk).toBe(1)
      expect(columns.find((column) => column.name === 'frequency_value')).toMatchObject({
        type: 'INTEGER',
        notnull: 1,
      })
      expect(columns.find((column) => column.name === 'stopped_on')?.notnull).toBe(0)
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

    it('refuse en base un type ou une unité hors liste', async () => {
      await expect(insertRaw(db, { type: 'vaccine' })).rejects.toThrow(/CHECK constraint failed/)
      await expect(insertRaw(db, { frequency_unit: 'year' })).rejects.toThrow(
        /CHECK constraint failed/,
      )
    })

    it('refuse en base une fréquence nulle ou négative', async () => {
      await expect(insertRaw(db, { frequency_value: 0 })).rejects.toThrow(/CHECK constraint failed/)
      await expect(insertRaw(db, { frequency_value: -2 })).rejects.toThrow(
        /CHECK constraint failed/,
      )
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

describe('treatmentsRepository — prises', () => {
  let db: InMemoryDb
  let repository: TreatmentsRepository
  let doses: TreatmentDosesRepository

  interface DoseRow {
    id: string
    treatment_id: string
    animal_id: string
    given_on: string
    next_due_date: string
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
    { createdAt = '2026-09-20T10:00:00.000Z', id = crypto.randomUUID() } = {},
  ): Promise<string> {
    await db.runMany([
      doses.insertStatement({
        id,
        treatmentId,
        animalId: MIETTE,
        givenOn,
        nextDueDate,
        frequency: { value: 3, unit: 'month' },
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      }),
    ])
    return id
  }

  function dosesOf(treatmentId: string): Promise<DoseRow[]> {
    return db.query<DoseRow>(
      'SELECT * FROM treatment_dose WHERE treatment_id = ? ORDER BY given_on',
      [treatmentId],
    )
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createTreatmentsRepository(db)
    doses = createTreatmentDosesRepository(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('crée le traitement et sa première prise, de même identifiant, fréquence recopiée', async () => {
    const created = await repository.create(bravecto)

    await expect(dosesOf(created.id)).resolves.toEqual([
      {
        id: created.id,
        treatment_id: created.id,
        animal_id: MIETTE,
        given_on: '2026-03-01',
        next_due_date: '2026-06-01',
        frequency_value: 3,
        frequency_unit: 'month',
        created_at: created.createdAt,
        updated_at: created.createdAt,
        deleted_at: null,
      },
    ])
  })

  it('n’écrit pas le traitement quand sa première prise est refusée', async () => {
    await db.execute(
      `CREATE TRIGGER refuse_prise BEFORE INSERT ON treatment_dose
       BEGIN SELECT RAISE(ABORT, 'prise refusée'); END`,
    )

    await expect(repository.create(bravecto)).rejects.toThrow('prise refusée')

    await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
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

  it('ignore une prise supprimée : la précédente redevient la tête', async () => {
    const created = await repository.create(bravecto)
    const recente = await addDose(created.id, '2026-06-03', '2026-09-03')

    await db.run('UPDATE treatment_dose SET deleted_at = updated_at WHERE id = ?', [recente])

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      lastDoseDate: '2026-03-01',
      nextDueDate: '2026-06-01',
    })
  })

  it('garde la fréquence du plan, pas celle recopiée sur la prise', async () => {
    const created = await repository.create(bravecto)
    await db.run(
      `UPDATE treatment_dose SET frequency_value = 2, frequency_unit = 'week' WHERE id = ?`,
      [created.id],
    )

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      frequency: { value: 3, unit: 'month' },
    })
  })

  it('lit la date d’arrêt du plan', async () => {
    const created = await repository.create(bravecto)
    expect(created.stoppedOn).toBeNull()

    await db.run(`UPDATE treatment SET stopped_on = '2026-09-01' WHERE id = ?`, [created.id])

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: '2026-09-01',
    })
  })

  it('arrête un traitement à une date, puis annule l’arrêt', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await repository.create(bravecto)
    vi.advanceTimersByTime(60_000)

    await expect(repository.stop(created.id, '2026-09-24')).resolves.toBe(true)

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: '2026-09-24',
      updatedAt: '2026-09-24T10:01:00.000Z',
    })

    vi.advanceTimersByTime(60_000)
    await repository.undoStop(created.id)

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: null,
      updatedAt: '2026-09-24T10:02:00.000Z',
    })
  })

  it('n’arrête pas de nouveau un traitement déjà arrêté : sa date d’arrêt est gardée', async () => {
    const created = await repository.create(bravecto)
    await repository.stop(created.id, '2026-09-01')

    await expect(repository.stop(created.id, '2026-09-24')).resolves.toBe(false)

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      stoppedOn: '2026-09-01',
    })
  })

  it('n’arrête pas un traitement supprimé', async () => {
    const created = await repository.create(bravecto)
    await repository.remove(created.id)

    await expect(repository.stop(created.id, '2026-09-24')).resolves.toBe(false)
  })

  it('ne montre pas un traitement sans prise visible', async () => {
    await insertRaw(db, { id: 'sans-prise' })

    await expect(repository.getById('sans-prise')).resolves.toBeNull()
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

  it('la modification change le plan et sa prise de tête, pas sa date ni les prises précédentes', async () => {
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
        frequency_value: 3,
        frequency_unit: 'month',
      }),
      expect.objectContaining({
        id: created.id,
        given_on: '2026-03-01',
        next_due_date: '2026-03-29',
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

  it('change la fréquence seule : plan et prise de tête bougent ensemble', async () => {
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
    await expect(dosesOf(created.id)).resolves.toMatchObject([
      { frequency_value: 1, frequency_unit: 'month', next_due_date: '2026-04-01' },
    ])
  })

  it('change la fréquence et reporte dans la même saisie : le report est gardé', async () => {
    const created = await repository.create(bravecto)

    await repository.update(created.id, {
      ...edition,
      frequency: { value: 1, unit: 'month' },
      nextDueDate: '2026-04-15',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      frequency: { value: 1, unit: 'month' },
      nextDueDate: '2026-04-15',
    })
    await expect(dosesOf(created.id)).resolves.toMatchObject([
      { frequency_value: 1, frequency_unit: 'month', next_due_date: '2026-04-15' },
    ])
  })

  it('reporte seul : la prise de tête garde la fréquence du plan', async () => {
    const created = await repository.create(bravecto)

    await repository.update(created.id, { ...edition, nextDueDate: '2026-06-20' })

    await expect(dosesOf(created.id)).resolves.toMatchObject([
      {
        given_on: '2026-03-01',
        frequency_value: 3,
        frequency_unit: 'month',
        next_due_date: '2026-06-20',
      },
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

  it('n’écrit ni le plan ni la prise quand l’une des deux écritures échoue', async () => {
    const created = await repository.create(bravecto)
    await db.execute(
      `CREATE TRIGGER refuse_modification BEFORE UPDATE ON treatment_dose
       BEGIN SELECT RAISE(ABORT, 'prise verrouillée'); END`,
    )

    await expect(
      repository.update(created.id, { ...edition, frequency: { value: 1, unit: 'month' } }),
    ).rejects.toThrow('prise verrouillée')

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      frequency: { value: 3, unit: 'month' },
      nextDueDate: '2026-06-01',
    })
  })

  it('supprimer un traitement pose sa date de suppression sur toutes ses prises', async () => {
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
    await expect(dosesOf(autre.id)).resolves.toMatchObject([{ deleted_at: null }])
  })

  it('supprimer deux fois un traitement ne change pas la date de ses prises', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const created = await repository.create(bravecto)
    await repository.remove(created.id)
    const avant = await dosesOf(created.id)
    vi.advanceTimersByTime(60_000)

    await repository.remove(created.id)

    await expect(dosesOf(created.id)).resolves.toEqual(avant)
  })
})

describe('treatmentsRepository — import', () => {
  const IMPORTE: ExportTreatment = {
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
  let doses: TreatmentDosesRepository

  function restore(treatment: ExportTreatment, exists: boolean) {
    return db.runMany([
      repository.restoreStatement(treatment, exists),
      doses.restoreStatement(
        {
          id: treatment.id,
          treatmentId: treatment.id,
          animalId: treatment.animalId,
          givenOn: treatment.lastDoseDate,
          nextDueDate: treatment.nextDueDate,
          frequency: treatment.frequency,
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
    doses = createTreatmentDosesRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('insère un traitement importé avec son échéance et ses dates d’origine', async () => {
    await restore(IMPORTE, false)

    await expect(repository.getById(IMPORTE.id)).resolves.toEqual({
      ...IMPORTE,
      stoppedOn: null,
      deletedAt: null,
    })
  })

  it('écrase un traitement existant, même supprimé, et le rend visible', async () => {
    await restore(IMPORTE, false)
    await repository.remove(IMPORTE.id)
    const importe: ExportTreatment = {
      ...IMPORTE,
      type: 'antiparasitic',
      frequency: { value: 2, unit: 'week' },
      nextDueDate: '2026-07-15',
      updatedAt: '2026-09-15T08:00:00.000Z',
    }

    await restore(importe, true)

    await expect(repository.getById(IMPORTE.id)).resolves.toEqual({
      ...importe,
      stoppedOn: null,
      deletedAt: null,
    })
    await expect(
      db.query('SELECT id, frequency_value, frequency_unit FROM treatment_dose'),
    ).resolves.toEqual([{ id: IMPORTE.id, frequency_value: 2, frequency_unit: 'week' }])
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
