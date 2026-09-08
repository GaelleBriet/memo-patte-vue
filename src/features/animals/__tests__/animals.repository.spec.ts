// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import type { DbClient } from '@/core/db/db-client'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { getDb } from '@/core/db/sqlite'
import {
  createAnimalsRepository,
  getAnimalsRepository,
  type AnimalsRepository,
} from '../animals.repository'

// La fabrique est le seul code testé ici qui ouvre la base : on lui substitue `getDb`.
vi.mock('@/core/db/sqlite', () => ({ getDb: vi.fn<() => Promise<DbClient>>() }))

describe('animalsRepository', () => {
  let db: InMemoryDb
  let repository: AnimalsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    repository = createAnimalsRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('crée un animal puis le relit à l’identique', async () => {
    const created = await repository.create({
      name: 'Miette',
      species: 'cat',
      breed: 'Européen',
      birthDate: '2020-05-12',
      initialWeightKg: 3.4,
      photoPath: 'miette.jpg',
    })

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.createdAt).toBe(created.updatedAt)
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('complète les champs facultatifs à null', async () => {
    const created = await repository.create({ name: 'Vasco', species: 'dog' })

    expect(created).toMatchObject({
      breed: null,
      birthDate: null,
      initialWeightKg: null,
      photoPath: null,
    })
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getById('inconnu')).resolves.toBeNull()
  })

  it('liste les animaux triés par nom, sans tenir compte de la casse', async () => {
    await repository.create({ name: 'vasco', species: 'dog' })
    await repository.create({ name: 'Miette', species: 'cat' })
    await repository.create({ name: 'Abricot', species: 'cat' })

    const names = (await repository.list()).map((animal) => animal.name)
    expect(names).toEqual(['Abricot', 'Miette', 'vasco'])
  })

  it('renvoie une liste vide quand la base est vide', async () => {
    await expect(repository.list()).resolves.toEqual([])
  })

  it('met à jour les champs et rafraîchit updatedAt sans toucher createdAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    try {
      const created = await repository.create({ name: 'Miette', species: 'cat', breed: 'Européen' })
      vi.advanceTimersByTime(60_000)

      const updated = await repository.update(created.id, {
        name: 'Miette la seconde',
        species: 'cat',
        initialWeightKg: 4,
      })

      expect(updated).toMatchObject({
        id: created.id,
        name: 'Miette la seconde',
        breed: null,
        initialWeightKg: 4,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:01:00.000Z',
      })
      await expect(repository.getById(created.id)).resolves.toEqual(updated)
    } finally {
      vi.useRealTimers()
    }
  })

  it('échoue à mettre à jour un animal inexistant', async () => {
    await expect(repository.update('inconnu', { name: 'Miette', species: 'cat' })).rejects.toThrow(
      'Animal introuvable : inconnu',
    )
  })

  it('supprime un animal et laisse les autres intacts', async () => {
    const miette = await repository.create({ name: 'Miette', species: 'cat' })
    const vasco = await repository.create({ name: 'Vasco', species: 'dog' })

    await repository.remove(miette.id)

    await expect(repository.getById(miette.id)).resolves.toBeNull()
    expect((await repository.list()).map((animal) => animal.id)).toEqual([vasco.id])
  })

  it('conserve la ligne supprimée en base avec deleted_at et updated_at renseignés', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    try {
      const miette = await repository.create({ name: 'Miette', species: 'cat' })
      vi.advanceTimersByTime(60_000)

      await repository.remove(miette.id)

      const rows = await db.query<{ id: string; deleted_at: string | null; updated_at: string }>(
        'SELECT id, deleted_at, updated_at FROM animal WHERE id = ?',
        [miette.id],
      )
      expect(rows).toEqual([
        {
          id: miette.id,
          deleted_at: '2026-03-01T10:01:00.000Z',
          updated_at: '2026-03-01T10:01:00.000Z',
        },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('expose deletedAt à null tant que l’animal n’est pas supprimé', async () => {
    const created = await repository.create({ name: 'Miette', species: 'cat' })

    expect(created.deletedAt).toBeNull()
    await expect(repository.getById(created.id)).resolves.toMatchObject({ deletedAt: null })
  })

  it('ne casse rien quand on supprime un identifiant inconnu', async () => {
    const miette = await repository.create({ name: 'Miette', species: 'cat' })

    await expect(repository.remove('inconnu')).resolves.toBeUndefined()

    expect((await repository.list()).map((animal) => animal.id)).toEqual([miette.id])
  })

  it('ne ressuscite pas un animal supprimé lors d’une mise à jour', async () => {
    const miette = await repository.create({ name: 'Miette', species: 'cat' })
    await repository.remove(miette.id)

    await expect(
      repository.update(miette.id, { name: 'Miette la seconde', species: 'cat' }),
    ).rejects.toThrow(`Animal introuvable : ${miette.id}`)

    const rows = await db.query<{ name: string; deleted_at: string | null }>(
      'SELECT name, deleted_at FROM animal WHERE id = ?',
      [miette.id],
    )
    expect(rows[0]?.name).toBe('Miette')
    expect(rows[0]?.deleted_at).not.toBeNull()
    await expect(repository.getById(miette.id)).resolves.toBeNull()
  })

  it('supprimer deux fois le même animal ne change pas la date de suppression', async () => {
    const miette = await repository.create({ name: 'Miette', species: 'cat' })
    await repository.remove(miette.id)
    const [first] = await db.query<{ deleted_at: string }>(
      'SELECT deleted_at FROM animal WHERE id = ?',
      [miette.id],
    )

    await repository.remove(miette.id)

    const [second] = await db.query<{ deleted_at: string }>(
      'SELECT deleted_at FROM animal WHERE id = ?',
      [miette.id],
    )
    expect(second?.deleted_at).toBe(first?.deleted_at)
  })

  it('rejette une espèce interdite avant d’atteindre la base', async () => {
    await expect(
      repository.create({
        name: 'Nemo',
        // @ts-expect-error espèce volontairement hors du schéma
        species: 'fish',
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.list()).resolves.toEqual([])
  })

  it('rejette un nom vide avant d’atteindre la base', async () => {
    await expect(repository.create({ name: '   ', species: 'dog' })).rejects.toBeInstanceOf(
      ZodError,
    )
    await expect(repository.list()).resolves.toEqual([])
  })
})

describe('getAnimalsRepository', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createInMemoryDb()
  })

  afterEach(() => {
    db.close()
  })

  it('ne met pas en cache une ouverture ratée, puis réutilise celle qui réussit', async () => {
    vi.mocked(getDb).mockRejectedValueOnce(new Error('base indisponible'))
    await expect(getAnimalsRepository()).rejects.toThrow('base indisponible')

    // Sans remise à null du cache, ce second appel renverrait la promesse rejetée
    // et annulerait le réessai voulu par `getDb()` (cf. core/db/sqlite.ts).
    vi.mocked(getDb).mockResolvedValueOnce(db)
    const repository = await getAnimalsRepository()
    await expect(repository.list()).resolves.toEqual([])

    // La base n'est ouverte qu'une fois : l'appel suivant rend le même repository.
    await expect(getAnimalsRepository()).resolves.toBe(repository)
    expect(getDb).toHaveBeenCalledTimes(2)
  })
})
