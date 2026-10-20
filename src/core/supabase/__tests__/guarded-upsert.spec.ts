// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardedUpsert, type SyncRow } from '../guarded-upsert'

interface FakeResult {
  data: unknown
  error: unknown
}

type Call = [method: string, ...args: unknown[]]

/** Chaque requête note ses appels et rend, une fois attendue, le résultat suivant de la file. */
function createFakeSupabase(results: FakeResult[]) {
  const requests: Array<{ table: string; calls: Call[] }> = []
  const from = vi.fn<(table: string) => unknown>((table) => {
    const request = { table, calls: [] as Call[] }
    requests.push(request)
    const result = results.shift() ?? { data: [], error: null }
    const builder: object = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'then') {
            return (resolve: (value: FakeResult) => unknown) => resolve(result)
          }
          return (...args: unknown[]) => {
            request.calls.push([String(property), ...args])
            return builder
          }
        },
      },
    )
    return builder
  })
  return { client: { from } as unknown as SupabaseClient, requests }
}

const ROW: SyncRow = {
  id: 'a1',
  user_id: 'u1',
  name: 'Milo',
  updated_at: '2026-01-01T00:00:00.000Z',
}
const KEPT = { id: 'a1', name: 'Milo', updated_at: '2025-12-29T00:00:00+00:00' }
const OPTIONS = { columns: 'id, name, updated_at', headers: { 'x-envoi': 'envoi-1' } }

describe('guardedUpsert', () => {
  it('rend la ligne gardée par la mise à jour conditionnée, sans tenter de création', async () => {
    const fake = createFakeSupabase([{ data: [KEPT], error: null }])

    await expect(
      guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW, OPTIONS),
    ).resolves.toEqual(KEPT)

    expect(fake.requests).toEqual([
      {
        table: 'animal',
        calls: [
          ['update', { name: 'Milo', updated_at: ROW.updated_at }],
          ['match', { user_id: 'u1', id: 'a1' }],
          ['lt', 'updated_at', ROW.updated_at],
          ['select', OPTIONS.columns],
          ['setHeader', 'x-envoi', 'envoi-1'],
        ],
      },
    ])
  })

  it("crée la ligne quand la mise à jour n'a rien trouvé, et rend la ligne créée", async () => {
    const fake = createFakeSupabase([
      { data: [], error: null },
      { data: [KEPT], error: null },
    ])

    await expect(
      guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW, OPTIONS),
    ).resolves.toEqual(KEPT)

    expect(fake.requests[1]).toEqual({
      table: 'animal',
      calls: [
        ['upsert', ROW, { onConflict: 'user_id,id', ignoreDuplicates: true }],
        ['select', OPTIONS.columns],
        ['setHeader', 'x-envoi', 'envoi-1'],
      ],
    })
  })

  it('relit la ligne du serveur quand il a gardé la sienne, plus récente', async () => {
    const fake = createFakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
      { data: KEPT, error: null },
    ])

    await expect(
      guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW, OPTIONS),
    ).resolves.toEqual(KEPT)

    expect(fake.requests[2]).toEqual({
      table: 'animal',
      calls: [['select', OPTIONS.columns], ['match', { user_id: 'u1', id: 'a1' }], ['maybeSingle']],
    })
  })

  it("lève l'erreur de la mise à jour sans tenter de création", async () => {
    const fake = createFakeSupabase([{ data: null, error: new Error('réseau') }])

    await expect(
      guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW, OPTIONS),
    ).rejects.toThrow('réseau')
    expect(fake.requests).toHaveLength(1)
  })

  it("lève l'erreur de la création", async () => {
    const fake = createFakeSupabase([
      { data: [], error: null },
      { data: null, error: new Error('403') },
    ])

    await expect(
      guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW, OPTIONS),
    ).rejects.toThrow('403')
  })

  it("lève l'erreur de la relecture", async () => {
    const fake = createFakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: new Error('relecture') },
    ])

    await expect(
      guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW, OPTIONS),
    ).rejects.toThrow('relecture')
  })
})
