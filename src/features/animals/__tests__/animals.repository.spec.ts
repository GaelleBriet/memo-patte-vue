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
} from '../repository/animals.repository'

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
      photoPath: null,
    })
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('crée un animal suivi, sans date approximative ni départ', async () => {
    const created = await repository.create({ name: 'Vasco', species: 'dog' })

    await expect(
      db.query(
        `SELECT birth_date_approximate, unfollowed_on, departure_reason, departure_date
         FROM animal WHERE id = ?`,
        [created.id],
      ),
    ).resolves.toEqual([
      {
        birth_date_approximate: 0,
        unfollowed_on: null,
        departure_reason: null,
        departure_date: null,
      },
    ])
  })

  describe('create avec des écritures liées', () => {
    it('les joue dans la même transaction, avec l’animal créé', async () => {
      const created = await repository.create({ name: 'Pixel', species: 'cat' }, (animal) => [
        {
          sql: `INSERT INTO weight_entry (id, animal_id, weight_kg, measured_on, created_at, updated_at, created_by_device, updated_by_device)
                VALUES ('w1', ?, 1.2, '2026-09-28', ?, ?, 'appareil-test', 'appareil-test')`,
          params: [animal.id, animal.createdAt, animal.createdAt],
        },
      ])

      await expect(
        db.query('SELECT animal_id, created_at FROM weight_entry WHERE id = ?', ['w1']),
      ).resolves.toEqual([{ animal_id: created.id, created_at: created.createdAt }])
    })

    it('ne crée pas l’animal quand une écriture liée échoue', async () => {
      await expect(
        repository.create({ name: 'Pixel', species: 'cat' }, () => [
          { sql: 'INSERT INTO table_inexistante VALUES (1)' },
        ]),
      ).rejects.toThrow(/no such table/)

      await expect(repository.list()).resolves.toEqual([])
    })
  })

  it('renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getById('inconnu')).resolves.toBeNull()
  })

  it('liste les animaux dans leur ordre de création', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    await repository.create({ name: 'vasco', species: 'dog' })
    vi.advanceTimersByTime(1000)
    await repository.create({ name: 'Miette', species: 'cat' })
    vi.advanceTimersByTime(1000)
    await repository.create({ name: 'Abricot', species: 'cat' })
    vi.useRealTimers()

    const names = (await repository.list()).map((animal) => animal.name)
    expect(names).toEqual(['vasco', 'Miette', 'Abricot'])
  })

  it('départage par nom, sans tenir compte de la casse, à création identique (import)', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    await repository.create({ name: 'Vasco', species: 'dog' })
    await repository.create({ name: 'abricot', species: 'cat' })
    vi.useRealTimers()

    const names = (await repository.list()).map((animal) => animal.name)
    expect(names).toEqual(['abricot', 'Vasco'])
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
      })

      expect(updated).toMatchObject({
        id: created.id,
        name: 'Miette la seconde',
        breed: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:01:00.000Z',
      })
      await expect(repository.getById(created.id)).resolves.toEqual(updated)
    } finally {
      vi.useRealTimers()
    }
  })

  it('garde le suivi et le départ de l’animal à la mise à jour', async () => {
    const created = await repository.create({
      name: 'Luna',
      species: 'cat',
      birthDate: '2026-07-20',
    })
    await db.run(
      `UPDATE animal
       SET birth_date_approximate = 1, unfollowed_on = '2026-09-30', departure_reason = 'rehomed',
           departure_date = '2026-09-28'
       WHERE id = ?`,
      [created.id],
    )

    await repository.update(created.id, { name: 'Luna', species: 'cat', breed: 'Européen' })

    await expect(
      db.query(
        `SELECT birth_date_approximate, unfollowed_on, departure_reason, departure_date
         FROM animal WHERE id = ?`,
        [created.id],
      ),
    ).resolves.toEqual([
      {
        birth_date_approximate: 1,
        unfollowed_on: '2026-09-30',
        departure_reason: 'rehomed',
        departure_date: '2026-09-28',
      },
    ])
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

  describe('remove avec cascade', () => {
    it('applique les instructions de la cascade dans la même transaction', async () => {
      const miette = await repository.create({ name: 'Miette', species: 'cat' })
      await db.run(
        `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at, created_by_device, updated_by_device)
         VALUES ('v1', ?, 'Rage', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'appareil-test', 'appareil-test')`,
        [miette.id],
      )

      await repository.remove(miette.id, [
        {
          sql: 'UPDATE vaccination SET deleted_at = ? WHERE animal_id = ?',
          params: ['2026-03-01T10:00:00.000Z', miette.id],
        },
      ])

      await expect(repository.getById(miette.id)).resolves.toBeNull()
      const rows = await db.query<{ deleted_at: string | null }>(
        'SELECT deleted_at FROM vaccination WHERE id = ?',
        ['v1'],
      )
      expect(rows).toEqual([{ deleted_at: '2026-03-01T10:00:00.000Z' }])
    })

    it('prend la date de suppression fournie par l’appelant', async () => {
      const miette = await repository.create({ name: 'Miette', species: 'cat' })

      await repository.remove(miette.id, [], '2026-03-01T10:00:00.000Z')

      const rows = await db.query<{ deleted_at: string | null; updated_at: string }>(
        'SELECT deleted_at, updated_at FROM animal WHERE id = ?',
        [miette.id],
      )
      expect(rows).toEqual([
        { deleted_at: '2026-03-01T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' },
      ])
    })

    it('ne marque pas l’animal quand une instruction de la cascade échoue', async () => {
      const miette = await repository.create({ name: 'Miette', species: 'cat' })

      await expect(
        repository.remove(miette.id, [{ sql: 'UPDATE table_inexistante SET deleted_at = 1' }]),
      ).rejects.toThrow(/no such table/)

      await expect(repository.getById(miette.id)).resolves.toEqual(miette)
      const rows = await db.query<{ deleted_at: string | null }>(
        'SELECT deleted_at FROM animal WHERE id = ?',
        [miette.id],
      )
      expect(rows).toEqual([{ deleted_at: null }])
    })
  })

  describe('suivi', () => {
    const DEPARTED = {
      unfollowedOn: '2026-09-28',
      departureReason: 'death',
      departureDate: '2026-09-27',
    } as const
    const FOLLOWED = { unfollowedOn: null, departureReason: null, departureDate: null }

    it('lit un animal suivi avec unfollowedOn à null', async () => {
      const luna = await repository.create({ name: 'Luna', species: 'cat' })

      expect(luna.unfollowedOn).toBeNull()
      await expect(repository.getDeparture(luna.id)).resolves.toEqual(FOLLOWED)
    })

    it('écrit le départ et le relit, sur l’animal comme dans la liste', async () => {
      const luna = await repository.create({ name: 'Luna', species: 'cat' })

      await repository.setDeparture(luna.id, DEPARTED)

      await expect(repository.getDeparture(luna.id)).resolves.toEqual(DEPARTED)
      await expect(repository.getById(luna.id)).resolves.toMatchObject({
        unfollowedOn: '2026-09-28',
      })
      await expect(repository.list()).resolves.toEqual([
        expect.objectContaining({ id: luna.id, unfollowedOn: '2026-09-28' }),
      ])
    })

    it('date la modification pour la synchronisation', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-01T08:00:00.000Z') })
      try {
        const luna = await repository.create({ name: 'Luna', species: 'cat' })
        vi.setSystemTime(new Date('2026-09-28T08:00:00.000Z'))

        await repository.setDeparture(luna.id, DEPARTED)

        await expect(
          db.query('SELECT updated_at FROM animal WHERE id = ?', [luna.id]),
        ).resolves.toEqual([{ updated_at: '2026-09-28T08:00:00.000Z' }])
      } finally {
        vi.useRealTimers()
      }
    })

    it('efface le départ pour suivre de nouveau', async () => {
      const luna = await repository.create({ name: 'Luna', species: 'cat' })
      await repository.setDeparture(luna.id, DEPARTED)

      await repository.setDeparture(luna.id, FOLLOWED)

      await expect(repository.getDeparture(luna.id)).resolves.toEqual(FOLLOWED)
    })

    it('joue les écritures liées dans la même transaction', async () => {
      const luna = await repository.create({ name: 'Luna', species: 'cat' })

      await expect(
        repository.setDeparture(luna.id, DEPARTED, [
          { sql: 'UPDATE table_inexistante SET deleted_at = 1' },
        ]),
      ).rejects.toThrow(/no such table/)

      await expect(repository.getDeparture(luna.id)).resolves.toEqual(FOLLOWED)
    })

    it('renvoie null pour un animal inconnu ou supprimé', async () => {
      const luna = await repository.create({ name: 'Luna', species: 'cat' })
      await repository.remove(luna.id)

      await expect(repository.getDeparture(luna.id)).resolves.toBeNull()
      await expect(repository.getDeparture('inconnu')).resolves.toBeNull()
    })
  })

  describe('restore', () => {
    it('rend l’animal supprimé à cet instant, avec les écritures liées', async () => {
      const luna = await repository.create({ name: 'Luna', species: 'cat' })
      await repository.remove(luna.id, [], '2026-03-01T10:00:00.000Z')
      await db.run(
        `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at, deleted_at, created_by_device, updated_by_device)
         VALUES ('v1', ?, 'Rage', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-03-01T10:00:00.000Z', 'appareil-test', 'appareil-test')`,
        [luna.id],
      )

      await repository.restore(luna.id, '2026-03-01T10:00:00.000Z', [
        { sql: "UPDATE vaccination SET deleted_at = NULL WHERE id = 'v1'" },
      ])

      await expect(repository.getById(luna.id)).resolves.toMatchObject({
        id: luna.id,
        deletedAt: null,
      })
      await expect(
        db.query('SELECT deleted_at FROM vaccination WHERE id = ?', ['v1']),
      ).resolves.toEqual([{ deleted_at: null }])
    })

    it('ne rend pas un animal supprimé à un autre instant', async () => {
      const luna = await repository.create({ name: 'Luna', species: 'cat' })
      await repository.remove(luna.id, [], '2026-03-01T10:00:00.000Z')

      await repository.restore(luna.id, '2026-03-02T10:00:00.000Z')

      await expect(repository.getById(luna.id)).resolves.toBeNull()
    })

    it('date le retour pour la synchronisation', async () => {
      const luna = await repository.create({ name: 'Luna', species: 'cat' })
      await repository.remove(luna.id, [], '2026-03-01T10:00:00.000Z')

      await repository.restore(luna.id, '2026-03-01T10:00:00.000Z')

      const [row] = await db.query<{ updated_at: string }>(
        'SELECT updated_at FROM animal WHERE id = ?',
        [luna.id],
      )
      expect(row && row.updated_at > '2026-03-01T10:00:00.000Z').toBe(true)
    })
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

    // Sans remise à `null` du cache, ce second appel resservirait le rejet.
    vi.mocked(getDb).mockResolvedValueOnce(db)
    const repository = await getAnimalsRepository()
    await expect(repository.list()).resolves.toEqual([])

    await expect(getAnimalsRepository()).resolves.toBe(repository)
    expect(getDb).toHaveBeenCalledTimes(2)
  })
})

describe('animalsRepository — import', () => {
  const IMPORTE = {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Luna',
    species: 'cat',
    breed: 'Européen',
    birthDate: '2019-03-02',
    birthDateApproximate: true,
    photoPath: null,
    unfollowedOn: '2026-01-20',
    departureReason: 'rehomed',
    departureDate: '2026-01-15',
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-02-01T08:00:00.000Z',
    createdByDevice: 'appareil-du-fichier',
    updatedByDevice: 'appareil-du-fichier',
  } as const

  let db: InMemoryDb
  let repository: AnimalsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    repository = createAnimalsRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('insère un animal importé avec son identifiant et ses dates d’origine', async () => {
    await repository.runImport([repository.restoreStatement(IMPORTE, false)])

    await expect(repository.listRecords()).resolves.toEqual([{ ...IMPORTE, deletedAt: null }])
  })

  it('lit un animal créé dans l’app comme suivi, à la date de naissance exacte', async () => {
    const created = await repository.create({ name: 'Milo', species: 'dog' })

    await expect(repository.listRecords()).resolves.toEqual([
      {
        ...created,
        birthDateApproximate: false,
        unfollowedOn: null,
        departureReason: null,
        departureDate: null,
        createdByDevice: expect.any(String),
        updatedByDevice: expect.any(String),
      },
    ])
  })

  it('écrase un animal existant, même supprimé, et le rend visible', async () => {
    await repository.runImport([repository.restoreStatement(IMPORTE, false)])
    await repository.remove(IMPORTE.id)
    const importe = {
      ...IMPORTE,
      name: 'Luna II',
      species: 'dog',
      birthDateApproximate: false,
      photoPath: 'luna.jpg',
      unfollowedOn: null,
      departureReason: null,
      departureDate: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    } as const

    await repository.runImport([repository.restoreStatement(importe, true)])

    await expect(repository.listRecords()).resolves.toEqual([{ ...importe, deletedAt: null }])
  })

  it('liste les versions de toutes les lignes, photo comprise, supprimées comprises', async () => {
    const vivant = await repository.create({ name: 'Milo', species: 'dog', photoPath: 'milo.jpg' })
    await repository.runImport([repository.restoreStatement(IMPORTE, false)])
    await repository.remove(IMPORTE.id)

    const versions = await repository.listVersions()

    expect(versions).toHaveLength(2)
    expect(versions).toContainEqual({
      id: vivant.id,
      photoPath: 'milo.jpg',
      updatedAt: vivant.updatedAt,
      deletedAt: null,
    })
    expect(versions.find(({ id }) => id === IMPORTE.id)?.deletedAt).not.toBeNull()
  })

  it('marque tous les animaux encore visibles', async () => {
    await repository.runImport([
      repository.restoreStatement(IMPORTE, false),
      repository.markAllDeletedStatement('2030-01-01T09:00:00.000Z'),
    ])

    await expect(repository.list()).resolves.toEqual([])
    await expect(repository.listVersions()).resolves.toEqual([
      {
        id: IMPORTE.id,
        photoPath: null,
        updatedAt: '2030-01-01T09:00:00.000Z',
        deletedAt: '2030-01-01T09:00:00.000Z',
      },
    ])
  })

  it('n’écrit rien quand une instruction de l’import échoue', async () => {
    const orpheline = {
      sql: `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at, created_by_device, updated_by_device)
            VALUES ('v', 'animal-absent', 'Rage', 'x', 'x', 'appareil-test', 'appareil-test')`,
    }

    await expect(
      repository.runImport([repository.restoreStatement(IMPORTE, false), orpheline]),
    ).rejects.toThrow(/FOREIGN KEY/)

    await expect(repository.listVersions()).resolves.toEqual([])
  })
})
