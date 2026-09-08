// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createVaccinationsRepository,
  type VaccinationsRepository,
} from '../vaccinations.repository'

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const ANIMAL_INCONNU = '33333333-3333-4333-8333-333333333333'

/**
 * Insère un animal directement en base : les features ne s'importent pas entre
 * elles, la fixture passe donc par du SQL et non par le repository animaux.
 */
async function seedAnimal(db: InMemoryDb, id: string, name: string) {
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, 'cat', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  )
}

describe('vaccinationsRepository', () => {
  let db: InMemoryDb
  let repository: VaccinationsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    // sql.js désactive les clés étrangères par défaut, contrairement au plugin Capacitor.
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createVaccinationsRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('crée un vaccin puis le relit à l’identique', async () => {
    const created = await repository.create({
      animalId: MIETTE,
      name: 'Typhus (RCP)',
      lastInjectionDate: '2025-09-12',
      dueDate: '2026-09-12',
    })

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.createdAt).toBe(created.updatedAt)
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('complète les champs facultatifs à null', async () => {
    const created = await repository.create({
      animalId: MIETTE,
      name: 'CHPPi',
      lastInjectionDate: '2025-06-12',
    })

    expect(created).toMatchObject({ dueDate: null, deletedAt: null })
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getById('inconnu')).resolves.toBeNull()
  })

  it('liste les vaccins d’un animal, injection la plus récente en tête', async () => {
    await repository.create({ animalId: MIETTE, name: 'Rage', lastInjectionDate: '2024-03-01' })
    await repository.create({ animalId: MIETTE, name: 'Typhus', lastInjectionDate: '2025-09-12' })
    await repository.create({ animalId: VASCO, name: 'CHPPi', lastInjectionDate: '2025-11-02' })

    const names = (await repository.listByAnimal(MIETTE)).map((vaccination) => vaccination.name)
    expect(names).toEqual(['Typhus', 'Rage'])
  })

  it('départage deux vaccins de même date par nom, sans tenir compte de la casse', async () => {
    await repository.create({ animalId: MIETTE, name: 'typhus', lastInjectionDate: '2025-09-12' })
    await repository.create({ animalId: MIETTE, name: 'Rage', lastInjectionDate: '2025-09-12' })
    await repository.create({ animalId: MIETTE, name: 'Abricot', lastInjectionDate: '2025-09-12' })

    const names = (await repository.listByAnimal(MIETTE)).map((vaccination) => vaccination.name)
    expect(names).toEqual(['Abricot', 'Rage', 'typhus'])
  })

  it('renvoie une liste vide pour un animal sans vaccin', async () => {
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('met à jour les champs et rafraîchit updatedAt sans toucher createdAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    try {
      const created = await repository.create({
        animalId: MIETTE,
        name: 'CHPPi',
        lastInjectionDate: '2025-06-12',
        dueDate: '2026-06-12',
      })
      vi.advanceTimersByTime(60_000)

      const updated = await repository.update(created.id, {
        animalId: MIETTE,
        name: 'CHPPiL',
        lastInjectionDate: '2026-02-10',
      })

      expect(updated).toMatchObject({
        id: created.id,
        animalId: MIETTE,
        name: 'CHPPiL',
        lastInjectionDate: '2026-02-10',
        dueDate: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:01:00.000Z',
      })
      await expect(repository.getById(created.id)).resolves.toEqual(updated)
    } finally {
      vi.useRealTimers()
    }
  })

  it('échoue à mettre à jour un vaccin inexistant', async () => {
    await expect(
      repository.update('inconnu', {
        animalId: MIETTE,
        name: 'CHPPi',
        lastInjectionDate: '2025-06-12',
      }),
    ).rejects.toThrow('Vaccin introuvable : inconnu')
  })

  it('supprime un vaccin et laisse les autres intacts', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    const typhus = await repository.create({
      animalId: MIETTE,
      name: 'Typhus',
      lastInjectionDate: '2025-09-12',
    })

    await repository.remove(rage.id)

    await expect(repository.getById(rage.id)).resolves.toBeNull()
    expect((await repository.listByAnimal(MIETTE)).map((v) => v.id)).toEqual([typhus.id])
  })

  it('conserve la ligne supprimée en base avec deleted_at et updated_at renseignés', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    try {
      const rage = await repository.create({
        animalId: MIETTE,
        name: 'Rage',
        lastInjectionDate: '2024-03-01',
      })
      vi.advanceTimersByTime(60_000)

      await repository.remove(rage.id)

      const rows = await db.query<{ id: string; deleted_at: string | null; updated_at: string }>(
        'SELECT id, deleted_at, updated_at FROM vaccination WHERE id = ?',
        [rage.id],
      )
      expect(rows).toEqual([
        {
          id: rage.id,
          deleted_at: '2026-03-01T10:01:00.000Z',
          updated_at: '2026-03-01T10:01:00.000Z',
        },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne casse rien quand on supprime un identifiant inconnu', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })

    await expect(repository.remove('inconnu')).resolves.toBeUndefined()

    expect((await repository.listByAnimal(MIETTE)).map((v) => v.id)).toEqual([rage.id])
  })

  it('ne ressuscite pas un vaccin supprimé lors d’une mise à jour', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await repository.remove(rage.id)

    await expect(
      repository.update(rage.id, {
        animalId: MIETTE,
        name: 'Rage renouvelée',
        lastInjectionDate: '2026-03-01',
      }),
    ).rejects.toThrow(`Vaccin introuvable : ${rage.id}`)

    const rows = await db.query<{ name: string; deleted_at: string | null }>(
      'SELECT name, deleted_at FROM vaccination WHERE id = ?',
      [rage.id],
    )
    expect(rows[0]?.name).toBe('Rage')
    expect(rows[0]?.deleted_at).not.toBeNull()
    await expect(repository.getById(rage.id)).resolves.toBeNull()
  })

  it('supprimer deux fois le même vaccin ne change pas la date de suppression', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await repository.remove(rage.id)
    const [first] = await db.query<{ deleted_at: string }>(
      'SELECT deleted_at FROM vaccination WHERE id = ?',
      [rage.id],
    )

    await repository.remove(rage.id)

    const [second] = await db.query<{ deleted_at: string }>(
      'SELECT deleted_at FROM vaccination WHERE id = ?',
      [rage.id],
    )
    expect(second?.deleted_at).toBe(first?.deleted_at)
  })

  it('rejette un nom de vaccin vide avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: MIETTE, name: '   ', lastInjectionDate: '2025-06-12' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
  })

  it('rejette une date de dernière injection dans le futur avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: MIETTE, name: 'CHPPi', lastInjectionDate: '2099-01-01' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
  })

  it('rejette un identifiant d’animal mal formé avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: 'a1', name: 'CHPPi', lastInjectionDate: '2025-06-12' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('refuse un vaccin rattaché à un animal inexistant (clé étrangère)', async () => {
    await expect(
      repository.create({
        animalId: ANIMAL_INCONNU,
        name: 'CHPPi',
        lastInjectionDate: '2025-06-12',
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)

    const rows = await db.query<{ id: string }>('SELECT id FROM vaccination')
    expect(rows).toEqual([])
  })
})
