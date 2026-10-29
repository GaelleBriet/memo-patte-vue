// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DbClient } from '@/core/db/db-client'
import { createBoundedFetch, SUPABASE_REQUEST_TIMEOUT_MS } from '@/core/supabase/request-timeout'
import { createRemoteSyncTable } from '../repository/remote-sync-table.repository'
import { createSyncPushRepository } from '../repository/sync-push.repository'
import { createSyncCycle } from '../service/sync-cycle'
import type { SyncableTable } from '../service/syncable-table'
import { createFakeOutbox } from './fake-sync-outbox'
import { createSyncTestDb } from './sync-test-db'

const QUEUED_AT = '2026-10-29T17:00:00.000Z'
const ROWS = 20

function serverMuteAfterOpeningPush() {
  return vi.fn<typeof fetch>(async (input) => {
    if (String(input).includes('/rest/v1/sync_push')) return new Response(null, { status: 201 })
    return new Promise<Response>(() => {})
  })
}

describe('cycle de synchro, serveur muet après l’ouverture de l’envoi', () => {
  let db: DbClient & { close(): void }

  beforeEach(async () => {
    db = await createSyncTestDb()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it(`${ROWS} lignes en file : le cycle rend la main au bout d’un délai, sans tirer, toutes les lignes en file`, async () => {
    const server = serverMuteAfterOpeningPush()
    const supabase = createClient('https://projet.supabase.co', 'sb_publishable_test', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: createBoundedFetch(server) },
    })
    const loadClient = async () => supabase
    const remote = createRemoteSyncTable({ table: 'animal', columns: 'id, updated_at', loadClient })
    const animal: SyncableTable = {
      entity: 'animal',
      getRowForPush: async (id) => ({ id, updated_at: QUEUED_AT }),
      pushRow: remote.pushRow,
      pullPage: remote.pullPage,
      applyRemoteRowStatement: () => ({ sql: 'SELECT 1', params: [] }),
      replacePushedRowStatement: () => ({ sql: 'SELECT 1', params: [] }),
    }
    const queued = Array.from({ length: ROWS }, (_, index) => ({
      entity: 'animal',
      entityId: `animal-${index}`,
      queuedAt: QUEUED_AT,
      attempts: 0,
    }))
    const outbox = createFakeOutbox(queued)
    const cycle = createSyncCycle({
      db,
      outbox,
      pushes: createSyncPushRepository(loadClient),
      tables: [animal],
      userId: () => 'user-1',
      isEligible: () => true,
    })
    const settled = vi.fn<(cause: unknown) => void>()
    void cycle.runCycle().then(settled, settled)

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: '' }))
    expect(server).toHaveBeenCalledTimes(2)
    expect(server.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/rest/v1/sync_push',
      '/rest/v1/animal',
    ])
    expect(outbox.entries()).toHaveLength(ROWS)
    expect(outbox.entries()[0]!.attempts).toBe(1)
    expect(outbox.lastSyncedAt()).toBeNull()
  })
})
