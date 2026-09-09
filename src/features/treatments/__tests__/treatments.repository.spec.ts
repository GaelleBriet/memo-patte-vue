// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createTreatmentsRepository, type TreatmentsRepository } from '../treatments.repository'

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
  last_dose_date: string
  next_due_date: string
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
    last_dose_date: '2026-01-01',
    next_due_date: '2026-02-01',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
  await db.run(
    `INSERT INTO treatment (id, animal_id, name, type, frequency_value, frequency_unit,
       last_dose_date, next_due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    await db.run('UPDATE treatment SET next_due_date = ? WHERE id = ?', ['2030-01-01', created.id])

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

  it('met à jour les champs, recalcule l’échéance et rafraîchit updatedAt sans toucher createdAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await repository.create(bravecto)
    vi.advanceTimersByTime(60_000)

    const updated = await repository.update(created.id, {
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 4, unit: 'week' },
      lastDoseDate: '2026-02-10',
    })

    expect(updated).toEqual({
      id: created.id,
      animalId: MIETTE,
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 4, unit: 'week' },
      lastDoseDate: '2026-02-10',
      nextDueDate: '2026-03-10',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:01:00.000Z',
      deletedAt: null,
    })
    await expect(repository.getById(created.id)).resolves.toEqual(updated)
  })

  it('recalcule l’échéance quand seule la date de dernière prise change', async () => {
    const created = await repository.create(bravecto)

    const updated = await repository.update(created.id, { ...bravecto, lastDoseDate: '2026-01-31' })

    expect(updated.nextDueDate).toBe('2026-04-30')
  })

  it('recalcule l’échéance quand seule la fréquence change', async () => {
    const created = await repository.create(bravecto)

    const updated = await repository.update(created.id, {
      ...bravecto,
      frequency: { value: 1, unit: 'month' },
    })

    expect(updated.nextDueDate).toBe('2026-04-01')
  })

  it('ne déplace pas un traitement vers un autre animal', async () => {
    const created = await repository.create(bravecto)

    const updated = await repository.update(created.id, {
      ...bravecto,
      // @ts-expect-error le rattachement est figé : `animalId` n'est pas modifiable
      animalId: VASCO,
    })

    expect(updated.animalId).toBe(MIETTE)
    expect((await repository.listByAnimal(MIETTE)).map((t) => t.id)).toEqual([created.id])
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('échoue à mettre à jour un traitement inexistant', async () => {
    await expect(repository.update('inconnu', bravecto)).rejects.toThrow(
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

    await expect(repository.update(created.id, { ...bravecto, name: 'Autre' })).rejects.toThrow(
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
        'last_dose_date',
        'next_due_date',
        'created_at',
        'updated_at',
        'deleted_at',
      ])
      expect(columns.find((column) => column.name === 'id')?.pk).toBe(1)
      expect(columns.find((column) => column.name === 'frequency_value')).toMatchObject({
        type: 'INTEGER',
        notnull: 1,
      })
      expect(columns.find((column) => column.name === 'next_due_date')?.notnull).toBe(1)
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
