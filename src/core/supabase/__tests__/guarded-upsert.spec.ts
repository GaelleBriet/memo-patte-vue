// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardedUpsert, type SyncRow } from '../guarded-upsert'

interface FakeResult {
  data: unknown
  error: unknown
}

interface FakeBuilder {
  update: (patch: unknown) => FakeBuilder
  match: (match: unknown) => FakeBuilder
  lt: (column: string, value: unknown) => FakeBuilder
  select: () => Promise<FakeResult>
  upsert: (row: unknown, options: unknown) => Promise<FakeResult>
}

function createFakeSupabase(
  updateResult: FakeResult,
  insertResult: FakeResult = { data: [], error: null },
) {
  const updateCalls: { patch?: unknown; match?: unknown; lt?: [string, unknown] } = {}
  let insertRow: unknown
  let insertOptions: unknown

  const builder: FakeBuilder = {
    update: vi.fn<FakeBuilder['update']>((patch) => {
      updateCalls.patch = patch
      return builder
    }),
    match: vi.fn<FakeBuilder['match']>((match) => {
      updateCalls.match = match
      return builder
    }),
    lt: vi.fn<FakeBuilder['lt']>((column, value) => {
      updateCalls.lt = [column, value]
      return builder
    }),
    select: vi.fn<FakeBuilder['select']>(() => Promise.resolve(updateResult)),
    upsert: vi.fn<FakeBuilder['upsert']>((row, options) => {
      insertRow = row
      insertOptions = options
      return Promise.resolve(insertResult)
    }),
  }

  const from = vi.fn<() => FakeBuilder>(() => builder)

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    updateCalls,
    getInsertRow: () => insertRow,
    getInsertOptions: () => insertOptions,
  }
}

const ROW: SyncRow = {
  id: 'a1',
  user_id: 'u1',
  name: 'Milo',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('guardedUpsert', () => {
  it('ne tente pas de création quand la mise à jour conditionnée a trouvé une ligne', async () => {
    const fake = createFakeSupabase({ data: [{ id: 'a1' }], error: null })

    await guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW)

    expect(fake.from).toHaveBeenCalledExactlyOnceWith('animal')
    expect(fake.updateCalls.match).toEqual({ user_id: 'u1', id: 'a1' })
    expect(fake.updateCalls.lt).toEqual(['updated_at', ROW.updated_at])
    expect(fake.updateCalls.patch).toEqual({ name: 'Milo', updated_at: ROW.updated_at })
  })

  it('exclut les colonnes de conflit du corps de la mise à jour', async () => {
    const fake = createFakeSupabase({ data: [{ id: 'a1' }], error: null })

    await guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW)

    expect(fake.updateCalls.patch).not.toHaveProperty('id')
    expect(fake.updateCalls.patch).not.toHaveProperty('user_id')
  })

  it("crée la ligne quand la mise à jour conditionnée n'a rien trouvé", async () => {
    const fake = createFakeSupabase({ data: [], error: null })

    await guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW)

    expect(fake.from).toHaveBeenCalledTimes(2)
    expect(fake.getInsertRow()).toEqual(ROW)
    expect(fake.getInsertOptions()).toEqual({ onConflict: 'user_id,id', ignoreDuplicates: true })
  })

  it("lève l'erreur de la mise à jour sans tenter de création", async () => {
    const fake = createFakeSupabase({ data: null, error: new Error('réseau') })

    await expect(guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW)).rejects.toThrow(
      'réseau',
    )
    expect(fake.getInsertRow()).toBeUndefined()
  })

  it("lève l'erreur de la création", async () => {
    const fake = createFakeSupabase(
      { data: [], error: null },
      { data: null, error: new Error('403') },
    )

    await expect(guardedUpsert(fake.client, 'animal', ['user_id', 'id'], ROW)).rejects.toThrow(
      '403',
    )
  })
})
