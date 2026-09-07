// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createAnimalsRepository, type AnimalsRepository } from '../animals.repository'

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
