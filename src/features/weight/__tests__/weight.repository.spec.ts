// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createWeightRepository, type WeightRepository } from '../weight.repository'

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const ANIMAL_INCONNU = '33333333-3333-4333-8333-333333333333'

async function seedAnimal(db: InMemoryDb, id: string, name: string) {
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, 'cat', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  )
}

describe('weightRepository', () => {
  let db: InMemoryDb
  let repository: WeightRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    // sql.js désactive les clés étrangères par défaut, contrairement au plugin Capacitor.
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createWeightRepository(db)
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it('crée une pesée puis la relit à l’identique', async () => {
    const created = await repository.create({
      animalId: MIETTE,
      weightKg: 4.2,
      measuredOn: '2026-03-01',
    })

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created).toMatchObject({ animalId: MIETTE, weightKg: 4.2, measuredOn: '2026-03-01' })
    expect(created.createdAt).toBe(created.updatedAt)
    expect(created.deletedAt).toBeNull()
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('accepte une pesée datée dans le passé', async () => {
    const created = await repository.create({
      animalId: MIETTE,
      weightKg: 3.1,
      measuredOn: '2020-01-15',
    })

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      measuredOn: '2020-01-15',
    })
  })

  it('renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getById('inconnu')).resolves.toBeNull()
  })

  it('liste les pesées d’un animal dans l’ordre chronologique croissant', async () => {
    await repository.create({ animalId: MIETTE, weightKg: 4.5, measuredOn: '2026-03-01' })
    await repository.create({ animalId: MIETTE, weightKg: 4.1, measuredOn: '2025-11-02' })
    await repository.create({ animalId: VASCO, weightKg: 12, measuredOn: '2026-01-10' })
    await repository.create({ animalId: MIETTE, weightKg: 4.3, measuredOn: '2026-01-10' })

    const weights = (await repository.listByAnimal(MIETTE)).map((entry) => entry.weightKg)
    expect(weights).toEqual([4.1, 4.3, 4.5])
  })

  it('départage deux pesées du même jour par date de saisie, pas par ordre d’insertion', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:01:00.000Z') })
    await repository.create({ animalId: MIETTE, weightKg: 4.4, measuredOn: '2026-03-01' })
    vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'))
    await repository.create({ animalId: MIETTE, weightKg: 4.5, measuredOn: '2026-03-01' })

    const weights = (await repository.listByAnimal(MIETTE)).map((entry) => entry.weightKg)
    expect(weights).toEqual([4.5, 4.4])
  })

  it('renvoie une liste vide pour un animal sans pesée', async () => {
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('met à jour les champs et rafraîchit updatedAt sans toucher createdAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await repository.create({
      animalId: MIETTE,
      weightKg: 4.2,
      measuredOn: '2026-02-10',
    })
    vi.advanceTimersByTime(60_000)

    const updated = await repository.update(created.id, { weightKg: 4.4, measuredOn: '2026-02-11' })

    expect(updated).toEqual({
      id: created.id,
      animalId: MIETTE,
      weightKg: 4.4,
      measuredOn: '2026-02-11',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:01:00.000Z',
      deletedAt: null,
    })
    await expect(repository.getById(created.id)).resolves.toEqual(updated)
  })

  it('ne déplace pas une pesée vers un autre animal', async () => {
    const created = await repository.create({
      animalId: MIETTE,
      weightKg: 4.2,
      measuredOn: '2026-02-10',
    })

    const updated = await repository.update(created.id, {
      weightKg: 4.3,
      measuredOn: '2026-02-10',
      // @ts-expect-error le rattachement est figé : `animalId` n'est pas modifiable
      animalId: VASCO,
    })

    expect(updated.animalId).toBe(MIETTE)
    expect((await repository.listByAnimal(MIETTE)).map((entry) => entry.id)).toEqual([created.id])
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('échoue à mettre à jour une pesée inexistante', async () => {
    await expect(
      repository.update('inconnu', { weightKg: 4.2, measuredOn: '2026-02-10' }),
    ).rejects.toThrow('Pesée introuvable : inconnu')
  })

  it('supprime une pesée et laisse les autres intactes', async () => {
    const first = await repository.create({
      animalId: MIETTE,
      weightKg: 4.1,
      measuredOn: '2026-01-10',
    })
    const second = await repository.create({
      animalId: MIETTE,
      weightKg: 4.3,
      measuredOn: '2026-02-10',
    })

    await repository.remove(first.id)

    await expect(repository.getById(first.id)).resolves.toBeNull()
    expect((await repository.listByAnimal(MIETTE)).map((entry) => entry.id)).toEqual([second.id])
  })

  it('conserve la ligne supprimée en base avec deleted_at et updated_at renseignés', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await repository.create({
      animalId: MIETTE,
      weightKg: 4.1,
      measuredOn: '2026-01-10',
    })
    vi.advanceTimersByTime(60_000)

    await repository.remove(created.id)

    const rows = await db.query<{ id: string; deleted_at: string | null; updated_at: string }>(
      'SELECT id, deleted_at, updated_at FROM weight_entry WHERE id = ?',
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
    const created = await repository.create({
      animalId: MIETTE,
      weightKg: 4.1,
      measuredOn: '2026-01-10',
    })

    await expect(repository.remove('inconnu')).resolves.toBeUndefined()

    expect((await repository.listByAnimal(MIETTE)).map((entry) => entry.id)).toEqual([created.id])
  })

  it('ne ressuscite pas une pesée supprimée lors d’une mise à jour', async () => {
    const created = await repository.create({
      animalId: MIETTE,
      weightKg: 4.1,
      measuredOn: '2026-01-10',
    })
    await repository.remove(created.id)

    await expect(
      repository.update(created.id, { weightKg: 9, measuredOn: '2026-02-10' }),
    ).rejects.toThrow(`Pesée introuvable : ${created.id}`)

    const rows = await db.query<{ weight_kg: number; deleted_at: string | null }>(
      'SELECT weight_kg, deleted_at FROM weight_entry WHERE id = ?',
      [created.id],
    )
    expect(rows[0]?.weight_kg).toBe(4.1)
    expect(rows[0]?.deleted_at).not.toBeNull()
  })

  it('supprimer deux fois la même pesée ne change pas la date de suppression', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const created = await repository.create({
      animalId: MIETTE,
      weightKg: 4.1,
      measuredOn: '2026-01-10',
    })
    await repository.remove(created.id)
    vi.advanceTimersByTime(60_000)

    await repository.remove(created.id)

    const rows = await db.query<{ deleted_at: string; updated_at: string }>(
      'SELECT deleted_at, updated_at FROM weight_entry WHERE id = ?',
      [created.id],
    )
    expect(rows).toEqual([
      { deleted_at: '2026-03-01T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' },
    ])
  })

  it('rejette un poids nul ou négatif avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: MIETTE, weightKg: 0, measuredOn: '2026-01-10' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      repository.create({ animalId: MIETTE, weightKg: -1, measuredOn: '2026-01-10' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
  })

  it('rejette une date de pesée dans le futur avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: MIETTE, weightKg: 4.1, measuredOn: '2099-01-01' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
  })

  it('rejette un identifiant d’animal mal formé avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: 'a1', weightKg: 4.1, measuredOn: '2026-01-10' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('refuse une pesée rattachée à un animal inexistant (clé étrangère)', async () => {
    await expect(
      repository.create({ animalId: ANIMAL_INCONNU, weightKg: 4.1, measuredOn: '2026-01-10' }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)

    await expect(db.query('SELECT id FROM weight_entry')).resolves.toEqual([])
  })

  describe('table weight_entry', () => {
    it('expose les colonnes attendues, rattachées à animal en cascade', async () => {
      const columns = await db.query<{ name: string; type: string; notnull: number; pk: number }>(
        'PRAGMA table_info(weight_entry)',
      )
      expect(columns.map((column) => column.name)).toEqual([
        'id',
        'animal_id',
        'weight_kg',
        'measured_on',
        'created_at',
        'updated_at',
        'deleted_at',
      ])
      expect(columns.find((column) => column.name === 'id')?.pk).toBe(1)
      expect(columns.find((column) => column.name === 'weight_kg')).toMatchObject({
        type: 'REAL',
        notnull: 1,
      })
      expect(columns.find((column) => column.name === 'measured_on')?.notnull).toBe(1)
      expect(columns.find((column) => column.name === 'deleted_at')?.notnull).toBe(0)

      const foreignKeys = await db.query<{ table: string; from: string; on_delete: string }>(
        'PRAGMA foreign_key_list(weight_entry)',
      )
      expect(foreignKeys).toMatchObject([
        { table: 'animal', from: 'animal_id', on_delete: 'CASCADE' },
      ])
    })

    it('est indexée par animal', async () => {
      const indexes = await db.query<{ name: string }>('PRAGMA index_list(weight_entry)')
      expect(indexes.map((index) => index.name)).toContain('idx_weight_entry_animal_id')
    })
  })

  describe('markDeletedByAnimalStatement', () => {
    it('construit l’instruction sans l’exécuter', async () => {
      const created = await repository.create({
        animalId: MIETTE,
        weightKg: 4.1,
        measuredOn: '2026-01-10',
      })

      const statement = repository.markDeletedByAnimalStatement(MIETTE, '2026-03-01T10:00:00.000Z')

      expect(statement).toEqual({
        sql: 'UPDATE weight_entry SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND deleted_at IS NULL',
        params: ['2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', MIETTE],
      })
      await expect(repository.getById(created.id)).resolves.toEqual(created)
    })

    it('exécutée via runMany, marque les pesées de l’animal sans toucher aux autres', async () => {
      const miette = await repository.create({
        animalId: MIETTE,
        weightKg: 4.1,
        measuredOn: '2026-01-10',
      })
      const vasco = await repository.create({
        animalId: VASCO,
        weightKg: 12,
        measuredOn: '2026-01-10',
      })
      const dejaSupprimee = await repository.create({
        animalId: MIETTE,
        weightKg: 4.0,
        measuredOn: '2025-12-10',
      })
      await repository.remove(dejaSupprimee.id)

      await db.runMany([
        repository.markDeletedByAnimalStatement(MIETTE, '2026-03-01T10:00:00.000Z'),
      ])

      await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
      await expect(repository.getById(vasco.id)).resolves.toEqual(vasco)
      const rows = await db.query<{ id: string; deleted_at: string | null }>(
        'SELECT id, deleted_at FROM weight_entry WHERE animal_id = ? ORDER BY measured_on',
        [MIETTE],
      )
      expect(rows.find((row) => row.id === miette.id)?.deleted_at).toBe('2026-03-01T10:00:00.000Z')
      expect(rows.find((row) => row.id === dejaSupprimee.id)?.deleted_at).not.toBe(
        '2026-03-01T10:00:00.000Z',
      )
    })
  })
})
