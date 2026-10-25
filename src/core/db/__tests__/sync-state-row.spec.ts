// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSyncStateRepository } from '@/core/sync/repository/sync-state.repository'
import { repairSyncStateRow } from '../sync-state-row'
import { createInMemoryDb, type InMemoryDb } from './in-memory-db'

describe('repairSyncStateRow', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createInMemoryDb()
  })

  afterEach(() => db.close())

  it('repose la ligne unique effacée par les anciennes fixtures, aux valeurs du premier lancement', async () => {
    await db.run('DELETE FROM sync_state')

    await repairSyncStateRow(db)

    await expect(db.query('SELECT * FROM sync_state')).resolves.toEqual([
      { id: 1, enabled: 0, restoring: 0, last_synced_at: null },
    ])
  })

  it('ne touche jamais une ligne présente', async () => {
    await db.run(
      'UPDATE sync_state SET enabled = 1, restoring = 2, last_synced_at = ? WHERE id = 1',
      ['2026-10-24T08:00:00.000Z'],
    )

    await repairSyncStateRow(db)

    await expect(db.query('SELECT * FROM sync_state')).resolves.toEqual([
      { id: 1, enabled: 1, restoring: 2, last_synced_at: '2026-10-24T08:00:00.000Z' },
    ])
  })

  it('rend lisibles la sauvegarde et la restauration en attente après réparation', async () => {
    await db.run('DELETE FROM sync_state')
    const syncState = createSyncStateRepository(db)
    await expect(syncState.isEnabled()).rejects.toThrow()

    await repairSyncStateRow(db)

    await expect(syncState.isEnabled()).resolves.toBe(false)
    await expect(syncState.restoreMode()).resolves.toBeNull()
  })
})
