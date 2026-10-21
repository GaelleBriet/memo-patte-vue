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
  const calls: unknown[][] = []
  const chained =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push([method, ...args])
      return builder
    }
  const builder: FakePullBuilder = {
    select: chained('select'),
    eq: chained('eq'),
    gte: chained('gte'),
    order: chained('order'),
    limit: (count) => {
      calls.push(['limit', count])
      return Promise.resolve(result)
    },
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

    expect(kept).toEqual({ ...ROW, updated_at: '2026-01-01T00:10:00+00:00' })
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
      updated_at: '2026-01-01T00:20:00+00:00',
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
    expect(calls).toEqual([
      ['select', 'id, weight_kg, server_updated_at'],
      ['eq', 'user_id', USER_ID],
      ['gte', 'server_updated_at', '2026-01-01T00:00:00.000Z'],
      ['order', 'server_updated_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['limit', 50],
    ])
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
      stamps: ['2026-01-02T00:00:00+00:00', '2026-01-03T00:00:00+00:00'],
      cursor: '2026-01-03T00:00:00+00:00',
    })
  })

  describe('pullPage après un identifiant (départage d’un même instant)', () => {
    async function serverWithTies() {
      const server = createFakeSyncServer()
      const remote = remoteAnimalTable(server.client, 'id, name, updated_at')
      const release = server.holdClock()
      for (const id of ['a', 'b', 'c']) await remote.pushRow(USER_ID, { ...ROW, id })
      release()
      await remote.pushRow(USER_ID, { ...ROW, id: 'd' })
      const shared = server.rows('animal')[0]!.server_updated_at as string
      return { remote, shared }
    }

    it('reprend les lignes du même instant après cet identifiant, puis les suivantes', async () => {
      const { remote, shared } = await serverWithTies()

      const page = await remote.pullPage(USER_ID, shared, 50, 'a')

      expect(page.rows.map(({ id }) => id)).toEqual(['b', 'c', 'd'])
    })

    it('ne lit les suivantes que si la page n’est pas pleine', async () => {
      const { remote, shared } = await serverWithTies()

      const page = await remote.pullPage(USER_ID, shared, 2, 'a')

      expect(page.rows.map(({ id }) => id)).toEqual(['b', 'c'])
      expect(page.cursor).toBe(shared)
    })

    it('parcourt plus d’une page de lignes au même instant sans en sauter ni en répéter', async () => {
      const server = createFakeSyncServer()
      const remote = remoteAnimalTable(server.client, 'id, name, updated_at')
      const ids = Array.from(
        { length: 12 },
        (_, index) => `ligne-${String(index).padStart(2, '0')}`,
      )
      const release = server.holdClock()
      for (const id of ids) await remote.pushRow(USER_ID, { ...ROW, id })
      release()

      const read: string[] = []
      let since = '1970-01-01T00:00:00.000Z'
      let afterId: string | undefined
      for (let guard = 0; guard < ids.length; guard += 1) {
        const page = await remote.pullPage(USER_ID, since, 5, afterId)
        read.push(...page.rows.map(({ id }) => id))
        if (page.rows.length < 5) break
        since = page.cursor!
        afterId = page.rows.at(-1)!.id
      }

      expect(read).toEqual(ids)
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
      stamps: [],
      cursor: null,
    })
  })

  describe('lectures de la sauvegarde du compte', () => {
    async function serverWithAnimals() {
      const server = createFakeSyncServer()
      const remote = remoteAnimalTable(server.client, 'id, name, updated_at, deleted_at')
      await remote.pushRow(USER_ID, { ...ROW, deleted_at: null })
      await remote.pushRow(USER_ID, {
        ...ROW,
        id: 'ligne-2',
        deleted_at: '2026-01-01T00:11:00.000Z',
      })
      await remote.pushRow('autre-compte', { ...ROW, id: 'ligne-3', deleted_at: null })
      return { server, remote }
    }

    it('countRemoteRows compte les lignes du compte, supprimées comprises', async () => {
      const { remote } = await serverWithAnimals()

      await expect(remote.countRemoteRows(USER_ID)).resolves.toBe(2)
    })

    it('countRemoteRows ne compte, avec aliveOnly, que les lignes non supprimées', async () => {
      const { remote } = await serverWithAnimals()

      await expect(remote.countRemoteRows(USER_ID, { aliveOnly: true })).resolves.toBe(1)
    })

    it('latestRemoteStamp rend la réception serveur la plus récente du compte', async () => {
      const { server, remote } = await serverWithAnimals()
      const ownStamps = server
        .rows('animal')
        .filter(({ user_id }) => user_id === USER_ID)
        .map(({ server_updated_at }) => String(server_updated_at))

      await expect(remote.latestRemoteStamp(USER_ID)).resolves.toBe(ownStamps.sort().at(-1))
    })

    it('latestRemoteStamp rend null pour un compte sans ligne', async () => {
      const { remote } = await serverWithAnimals()

      await expect(remote.latestRemoteStamp('compte-vide')).resolves.toBeNull()
    })

    it('les deux lectures lèvent l’erreur de Supabase', async () => {
      const failure = new Error('réseau')
      const failing = {
        from: () => ({
          select: (_columns: string, options?: { head?: boolean }) => {
            if (options?.head) {
              const counted = Object.assign(
                Promise.resolve({ count: null, data: null, error: failure }),
                { eq: () => counted, is: () => counted },
              )
              return counted
            }
            const query = {
              eq: () => query,
              order: () => query,
              limit: () => Promise.resolve({ data: null, error: failure }),
            }
            return query
          },
        }),
      } as unknown as SupabaseClient
      const remote = remoteAnimalTable(failing)

      await expect(remote.countRemoteRows(USER_ID)).rejects.toBe(failure)
      await expect(remote.latestRemoteStamp(USER_ID)).rejects.toBe(failure)
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
