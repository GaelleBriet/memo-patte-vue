// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createRemoteSyncTable } from '../repository/remote-sync-table.repository'
import { createFakeSyncServer } from './fake-sync-server'

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

function remoteAnimalTable(client: SupabaseClient, columns = 'id, name') {
  return createRemoteSyncTable({
    table: 'animal',
    columns,
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

  it("pushRow crée la ligne de l'utilisateur et la rend telle que le serveur l'a gardée", async () => {
    const server = createFakeSyncServer()

    const kept = await remoteAnimalTable(server.client, 'id, name, updated_at').pushRow(
      USER_ID,
      ROW,
    )

    expect(kept).toEqual({ ...ROW, updated_at: '2026-01-01T00:10:00.000+00:00' })
    expect(server.rows('animal')).toEqual([
      expect.objectContaining({ ...ROW, user_id: USER_ID, updated_at: kept?.updated_at }),
    ])
  })

  it('pushRow met à jour la ligne plus ancienne du serveur, sans la recréer', async () => {
    const server = createFakeSyncServer()
    const remote = remoteAnimalTable(server.client, 'id, name, updated_at')
    await remote.pushRow(USER_ID, ROW)

    await remote.pushRow(USER_ID, { ...ROW, name: 'Luna', updated_at: '2026-01-01T00:20:00.000Z' })

    expect(server.rows('animal').map(({ name }) => name)).toEqual(['Luna'])
  })

  it('pushRow rend la ligne plus récente du serveur quand il garde la sienne', async () => {
    const server = createFakeSyncServer()
    const remote = remoteAnimalTable(server.client, 'id, name, updated_at')
    await remote.pushRow(USER_ID, { ...ROW, name: 'Luna', updated_at: '2026-01-01T00:20:00.000Z' })

    await expect(remote.pushRow(USER_ID, ROW)).resolves.toEqual({
      ...ROW,
      name: 'Luna',
      updated_at: '2026-01-01T00:20:00.000+00:00',
    })
  })

  it("pushRow se réclame de l'envoi par son en-tête", async () => {
    const server = createFakeSyncServer()
    const remote = remoteAnimalTable(server.client, 'id, name, updated_at')
    await server.client
      .from('sync_push')
      .insert({ user_id: USER_ID, id: 'envoi-1', sent_at: '2026-01-01T00:11:00.000Z' })

    await remote.pushRow(USER_ID, ROW, { id: 'envoi-1', sentAt: '2026-01-01T00:11:00.000Z' })

    expect(server.pushes()).toEqual([
      expect.objectContaining({ id: 'envoi-1', writes: ['animal'] }),
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
