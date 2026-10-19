// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { createSyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'

async function createPhone(client: SupabaseClient) {
  const db = await createInMemoryDb()
  await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
  const loadSupabaseClient = async () => client
  const animals = createAnimalsRepository(db, { loadSupabaseClient })
  const outbox = createSyncOutboxRepository(db)
  const cycle = createSyncCycle({
    db,
    outbox,
    pushes: createSyncPushRepository(loadSupabaseClient),
    tables: [animals],
    userId: () => USER_ID,
    isEligible: () => true,
  })
  return { db, animals, outbox, sync: () => cycle.runCycle() }
}

type Phone = Awaited<ReturnType<typeof createPhone>>

const at = (instant: string) => vi.setSystemTime(new Date(instant))

describe('la ligne que le serveur a gardée, reprise par le téléphone qui a poussé', () => {
  let server: FakeSyncServer
  let a: Phone
  let b: Phone
  let lunaId: string

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-19T07:00:00.000Z') })
    server = createFakeSyncServer()
    a = await createPhone(server.client)
    b = await createPhone(server.client)
    lunaId = (await a.animals.create({ name: 'Luna', species: 'cat' })).id
    await a.sync()
    await b.sync()
  })

  afterEach(() => {
    vi.useRealTimers()
    a.db.close()
    b.db.close()
  })

  it('le serveur a gardé la ligne plus récente de B : A la reprend dès son envoi, pull coupé', async () => {
    at('2026-10-19T08:00:00.000Z')
    await a.animals.update(lunaId, { name: 'Luna A', species: 'cat' })
    at('2026-10-19T08:30:00.000Z')
    await b.animals.update(lunaId, { name: 'Luna B', species: 'cat' })
    await b.sync()

    server.cutPull('animal')
    await expect(a.sync()).rejects.toMatchObject({ message: 'réseau coupé' })

    await expect(a.animals.getById(lunaId)).resolves.toMatchObject({
      name: 'Luna B',
      updatedAt: '2026-10-19T08:30:00.000Z',
    })
    expect(await a.outbox.listPending()).toEqual([])
  })

  it('une écriture locale faite entre l’envoi et la relecture reste, et repart au cycle suivant', async () => {
    at('2026-10-19T08:00:00.000Z')
    await a.animals.update(lunaId, { name: 'Luna A', species: 'cat' })
    at('2026-10-19T08:30:00.000Z')
    await b.animals.update(lunaId, { name: 'Luna B', species: 'cat' })
    await b.sync()
    server.afterNextWrite('animal', async () => {
      at('2026-10-19T08:45:00.000Z')
      await a.animals.update(lunaId, { name: 'Luna A bis', species: 'cat' })
    })

    at('2026-10-19T08:40:00.000Z')
    await a.sync()
    await a.sync()
    await b.sync()

    for (const phone of [a, b]) {
      await expect(phone.animals.getById(lunaId)).resolves.toMatchObject({ name: 'Luna A bis' })
    }
  })

  it('chaque cycle qui envoie ouvre un envoi daté par le téléphone, dont toutes ses écritures se réclament', async () => {
    at('2026-10-19T08:00:00.000Z')
    await a.animals.create({ name: 'Milo', species: 'dog' })
    await a.animals.update(lunaId, { name: 'Luna A', species: 'cat' })
    at('2026-10-19T08:06:00.000Z')

    await a.sync()

    expect(server.pushes().at(-1)).toEqual({
      user_id: USER_ID,
      id: expect.any(String),
      sent_at: '2026-10-19T08:06:00.000Z',
      received_at: '2026-10-19T08:06:00.000718Z',
      writes: ['animal', 'animal'],
    })
  })
})
