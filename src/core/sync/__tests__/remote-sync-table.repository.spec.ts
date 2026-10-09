// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createRemoteSyncTable } from '../repository/remote-sync-table.repository'

const USER_ID = 'utilisateur-1'
const ROW = { id: 'ligne-1', name: 'Milo', updated_at: '2026-01-01T00:10:00.000Z' }

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

function fakePullClient(result: FakeResult) {
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
  const from = vi.fn<(table: string) => FakePullBuilder>(() => builder)
  return { client: { from } as unknown as SupabaseClient, from, calls }
}

interface FakePushBuilder {
  update: (patch: unknown) => FakePushBuilder
  match: (match: unknown) => FakePushBuilder
  lt: (column: string, value: unknown) => FakePushBuilder
  select: (columns: string) => Promise<FakeResult>
  upsert: (row: unknown, options: unknown) => Promise<{ error: unknown }>
}

function fakePushClient(updated: unknown[]) {
  const calls: Record<string, unknown> = {}
  const builder: FakePushBuilder = {
    update: vi.fn<FakePushBuilder['update']>((patch) => {
      calls.update = patch
      return builder
    }),
    match: vi.fn<FakePushBuilder['match']>((match) => {
      calls.match = match
      return builder
    }),
    lt: vi.fn<FakePushBuilder['lt']>((column, value) => {
      calls.lt = [column, value]
      return builder
    }),
    select: vi.fn<FakePushBuilder['select']>(() => Promise.resolve({ data: updated, error: null })),
    upsert: vi.fn<FakePushBuilder['upsert']>((row, options) => {
      calls.upsert = [row, options]
      return Promise.resolve({ error: null })
    }),
  }
  const from = vi.fn<(table: string) => FakePushBuilder>(() => builder)
  return { client: { from } as unknown as SupabaseClient, from, calls }
}

function remoteAnimalTable(client: SupabaseClient) {
  return createRemoteSyncTable({
    table: 'animal',
    columns: 'id, name',
    loadClient: () => Promise.resolve(client),
  })
}

describe('createRemoteSyncTable', () => {
  it('charge le client Supabase à chaque opération, jamais à la construction', async () => {
    const { client } = fakePullClient({ data: [], error: null })
    const loadClient = vi.fn<() => Promise<SupabaseClient>>(() => Promise.resolve(client))

    const remote = createRemoteSyncTable({ table: 'animal', columns: 'id, name', loadClient })
    expect(loadClient).not.toHaveBeenCalled()

    await remote.pullPage(USER_ID, '2026-01-01T00:00:00.000Z', 50)
    expect(loadClient).toHaveBeenCalledOnce()
  })

  it("pushRow met à jour la ligne de l'utilisateur, gardée par updated_at, sans la recréer", async () => {
    const { client, from, calls } = fakePushClient([{ id: ROW.id }])

    await remoteAnimalTable(client).pushRow(USER_ID, ROW)

    expect(from.mock.calls).toEqual([['animal']])
    expect(calls.update).toEqual({ name: ROW.name, updated_at: ROW.updated_at })
    expect(calls.match).toEqual({ user_id: USER_ID, id: ROW.id })
    expect(calls.lt).toEqual(['updated_at', ROW.updated_at])
    expect(calls.upsert).toBeUndefined()
  })

  it("pushRow crée la ligne sur la clé (user_id, id) quand la mise à jour n'a rien touché", async () => {
    const { client, from, calls } = fakePushClient([])

    await remoteAnimalTable(client).pushRow(USER_ID, ROW)

    expect(from.mock.calls).toEqual([['animal'], ['animal']])
    expect(calls.update).toEqual({ name: ROW.name, updated_at: ROW.updated_at })
    expect(calls.upsert).toEqual([
      { ...ROW, user_id: USER_ID },
      { onConflict: 'user_id,id', ignoreDuplicates: true },
    ])
  })

  it("pullPage lit la page de l'utilisateur depuis le curseur, dans l'ordre du serveur", async () => {
    const { client, from, calls } = fakePullClient({ data: [], error: null })
    const remote = createRemoteSyncTable({
      table: 'weight_entry',
      columns: 'id, weight_kg',
      loadClient: () => Promise.resolve(client),
    })

    await remote.pullPage(USER_ID, '2026-01-01T00:00:00.000Z', 50)

    expect(from).toHaveBeenCalledWith('weight_entry')
    expect(calls).toEqual({
      select: 'id, weight_kg, server_updated_at',
      eq: ['user_id', USER_ID],
      gte: ['server_updated_at', '2026-01-01T00:00:00.000Z'],
      order: ['server_updated_at', { ascending: true }],
      limit: 50,
    })
  })

  it('pullPage retire server_updated_at des lignes et le rend comme curseur de la dernière', async () => {
    const { client } = fakePullClient({
      data: [
        { ...ROW, server_updated_at: '2026-01-02T00:00:00+00:00' },
        { ...ROW, id: 'ligne-2', server_updated_at: '2026-01-03T00:00:00+00:00' },
      ],
      error: null,
    })
    const remote = createRemoteSyncTable({
      table: 'animal',
      columns: 'id, name',
      loadClient: () => Promise.resolve(client),
    })

    const page = await remote.pullPage(USER_ID, '2026-01-01T00:00:00.000Z', 50)

    expect(page).toEqual({
      rows: [ROW, { ...ROW, id: 'ligne-2' }],
      cursor: '2026-01-03T00:00:00+00:00',
    })
  })

  it('pullPage rend un curseur nul pour une page vide ou sans données', async () => {
    const { client } = fakePullClient({ data: null, error: null })
    const remote = createRemoteSyncTable({
      table: 'animal',
      columns: 'id, name',
      loadClient: () => Promise.resolve(client),
    })

    await expect(remote.pullPage(USER_ID, '2026-01-01T00:00:00.000Z', 50)).resolves.toEqual({
      rows: [],
      cursor: null,
    })
  })

  it("pullPage lève l'erreur de Supabase", async () => {
    const failure = new Error('réseau')
    const { client } = fakePullClient({ data: null, error: failure })
    const remote = createRemoteSyncTable({
      table: 'animal',
      columns: 'id, name',
      loadClient: () => Promise.resolve(client),
    })

    await expect(remote.pullPage(USER_ID, '2026-01-01T00:00:00.000Z', 50)).rejects.toBe(failure)
  })
})
