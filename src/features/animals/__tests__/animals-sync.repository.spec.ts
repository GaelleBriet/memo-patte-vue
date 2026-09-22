// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'

const T_OLD = '2026-01-01T00:00:00.000Z'
const T_LOCAL = '2026-01-01T00:05:00.000Z'
const T_NEW = '2026-01-01T00:10:00.000Z'
const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'

interface FakeResult {
  data: unknown
  error: unknown
}

interface FakePullBuilder {
  select: (columns: string) => FakePullBuilder
  eq: (column: string, value: unknown) => FakePullBuilder
  gte: (column: string, value: unknown) => FakePullBuilder
  order: (column: string, options: unknown) => FakePullBuilder
  limit: (count: number) => Promise<FakeResult>
}

function fakePullBuilder(result: FakeResult) {
  const calls: Record<string, unknown> = {}
  const builder: FakePullBuilder = {
    select: vi.fn<FakePullBuilder['select']>((columns) => {
      calls.select = columns
      return builder
    }),
    eq: vi.fn<FakePullBuilder['eq']>((column, value) => {
      calls.eq = [column, value]
      return builder
    }),
    gte: vi.fn<FakePullBuilder['gte']>((column, value) => {
      calls.gte = [column, value]
      return builder
    }),
    order: vi.fn<FakePullBuilder['order']>((column, options) => {
      calls.order = [column, options]
      return builder
    }),
    limit: vi.fn<FakePullBuilder['limit']>((count) => {
      calls.limit = count
      return Promise.resolve(result)
    }),
  }
  return { builder, calls }
}

interface FakeUpdateBuilder {
  update: (patch: unknown) => FakeUpdateBuilder
  match: (match: unknown) => FakeUpdateBuilder
  lt: (column: string, value: unknown) => FakeUpdateBuilder
  select: (columns: string) => Promise<FakeResult>
}

function fakeUpdateBuilder(result: FakeResult) {
  const calls: Record<string, unknown> = {}
  const builder: FakeUpdateBuilder = {
    update: vi.fn<FakeUpdateBuilder['update']>((patch) => {
      calls.update = patch
      return builder
    }),
    match: vi.fn<FakeUpdateBuilder['match']>((match) => {
      calls.match = match
      return builder
    }),
    lt: vi.fn<FakeUpdateBuilder['lt']>((column, value) => {
      calls.lt = [column, value]
      return builder
    }),
    select: vi.fn<FakeUpdateBuilder['select']>(() => Promise.resolve(result)),
  }
  return { builder, calls }
}

describe('animalsRepository — port de synchronisation', () => {
  let db: InMemoryDb
  let repository: AnimalsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    repository = createAnimalsRepository(db)
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, 'Milo', 'dog', ?, ?)`,
      [ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
  })

  afterEach(() => {
    db.close()
  })

  it('expose son entité', () => {
    expect(repository.entity).toBe('animal')
  })

  it('getRowForPush renvoie la ligne même supprimée logiquement (tombstone)', async () => {
    await db.run('UPDATE animal SET deleted_at = ? WHERE id = ?', [T_NEW, ANIMAL_ID])

    const row = await repository.getRowForPush(ANIMAL_ID)

    expect(row).toMatchObject({ id: ANIMAL_ID, deleted_at: T_NEW })
  })

  it('getRowForPush renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getRowForPush('inconnu')).resolves.toBeNull()
  })

  it("n'écrase pas une ligne locale plus récente qu'une ligne distante", async () => {
    const remote = {
      id: ANIMAL_ID,
      name: 'Milo (autre appareil)',
      species: 'dog',
      breed: null,
      birth_date: null,
      initial_weight_kg: null,
      photo_path: null,
      created_at: T_OLD,
      updated_at: T_OLD,
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    const [row] = await db.query<{ name: string; updated_at: string }>(
      'SELECT name, updated_at FROM animal WHERE id = ?',
      [ANIMAL_ID],
    )
    expect(row).toEqual({ name: 'Milo', updated_at: T_LOCAL })
  })

  it("n'écrase pas la ligne locale à égalité d'horodatage : l'appareil garde sa version", async () => {
    const remote = {
      id: ANIMAL_ID,
      name: 'Milo (autre appareil)',
      species: 'dog',
      breed: null,
      birth_date: null,
      initial_weight_kg: null,
      photo_path: null,
      created_at: T_LOCAL,
      updated_at: T_LOCAL,
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    const [row] = await db.query<{ name: string }>('SELECT name FROM animal WHERE id = ?', [
      ANIMAL_ID,
    ])
    expect(row?.name).toBe('Milo')
  })

  it('remplace la ligne locale par une version distante plus récente', async () => {
    const remote = {
      id: ANIMAL_ID,
      name: 'Milo (mis à jour)',
      species: 'dog',
      breed: 'Labrador',
      birth_date: '2020-01-01',
      initial_weight_kg: 12.5,
      photo_path: 'milo.jpg',
      created_at: T_LOCAL,
      updated_at: T_NEW,
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    const animal = await repository.getById(ANIMAL_ID)
    expect(animal).toMatchObject({
      name: 'Milo (mis à jour)',
      breed: 'Labrador',
      updatedAt: T_NEW,
    })
  })

  it('une suppression distante plus récente se propage comme une modification normale', async () => {
    const remote = {
      id: ANIMAL_ID,
      name: 'Milo',
      species: 'dog',
      breed: null,
      birth_date: null,
      initial_weight_kg: null,
      photo_path: null,
      created_at: T_LOCAL,
      updated_at: T_NEW,
      deleted_at: T_NEW,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(ANIMAL_ID)).resolves.toBeNull()
    const [row] = await db.query<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM animal WHERE id = ?',
      [ANIMAL_ID],
    )
    expect(row?.deleted_at).toBe(T_NEW)
  })

  it('crée localement une ligne distante inconnue', async () => {
    const otherId = '22222222-2222-4222-8222-222222222222'
    const remote = {
      id: otherId,
      name: 'Luna',
      species: 'cat',
      breed: null,
      birth_date: null,
      initial_weight_kg: null,
      photo_path: null,
      created_at: T_NEW,
      updated_at: T_NEW,
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(otherId)).resolves.toMatchObject({ name: 'Luna' })
  })

  it('pullPage filtre par utilisateur et par curseur, et calcule le curseur de la page', async () => {
    const remoteRows = [
      { id: ANIMAL_ID, name: 'Milo', server_updated_at: T_OLD },
      { id: 'x', name: 'Luna', server_updated_at: T_NEW },
    ]
    const { builder, calls } = fakePullBuilder({ data: remoteRows, error: null })
    const from = vi.fn<(table: string) => FakePullBuilder>(() => builder)
    const client = { from } as unknown as SupabaseClient
    const withClient = createAnimalsRepository(db, { loadSupabaseClient: async () => client })

    const page = await withClient.pullPage('user-1', T_OLD, 500)

    expect(from).toHaveBeenCalledExactlyOnceWith('animal')
    expect(calls.eq).toEqual(['user_id', 'user-1'])
    expect(calls.gte).toEqual(['server_updated_at', T_OLD])
    expect(calls.limit).toBe(500)
    expect(page.cursor).toBe(T_NEW)
    expect(page.rows).toEqual([
      { id: ANIMAL_ID, name: 'Milo' },
      { id: 'x', name: 'Luna' },
    ])
  })

  it('pullPage renvoie un curseur nul pour une page vide', async () => {
    const { builder } = fakePullBuilder({ data: [], error: null })
    const client = {
      from: vi.fn<(table: string) => FakePullBuilder>(() => builder),
    } as unknown as SupabaseClient
    const withClient = createAnimalsRepository(db, { loadSupabaseClient: async () => client })

    const page = await withClient.pullPage('user-1', T_OLD, 500)

    expect(page).toEqual({ rows: [], cursor: null })
  })

  it('pullPage lève l’erreur Supabase', async () => {
    const { builder } = fakePullBuilder({ data: null, error: new Error('réseau') })
    const client = {
      from: vi.fn<(table: string) => FakePullBuilder>(() => builder),
    } as unknown as SupabaseClient
    const withClient = createAnimalsRepository(db, { loadSupabaseClient: async () => client })

    await expect(withClient.pullPage('user-1', T_OLD, 500)).rejects.toThrow('réseau')
  })

  it("pushRow envoie la ligne locale et l'identifiant utilisateur à Supabase", async () => {
    const { builder, calls } = fakeUpdateBuilder({ data: [{ id: ANIMAL_ID }], error: null })
    const from = vi.fn<(table: string) => FakeUpdateBuilder>(() => builder)
    const client = { from } as unknown as SupabaseClient
    const withClient = createAnimalsRepository(db, { loadSupabaseClient: async () => client })

    await withClient.pushRow('user-1', { id: ANIMAL_ID, name: 'Milo', updated_at: T_LOCAL })

    expect(from).toHaveBeenCalledWith('animal')
    expect(calls.update).toEqual({ name: 'Milo', updated_at: T_LOCAL })
    expect(calls.match).toEqual({ user_id: 'user-1', id: ANIMAL_ID })
  })
})
