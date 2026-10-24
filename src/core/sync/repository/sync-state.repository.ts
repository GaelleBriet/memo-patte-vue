import type { DbClient } from '@/core/db/db-client'

interface SyncStateRow {
  enabled: number
  restoring: number
  last_synced_at: string | null
}

export type RestoreMode = 'merge' | 'replace'

const RESTORE_CODES: Record<RestoreMode, number> = { merge: 1, replace: 2 }
const RESTORE_MODES: Record<number, RestoreMode> = { 1: 'merge', 2: 'replace' }

export function createSyncStateRepository(db: DbClient) {
  async function state(): Promise<SyncStateRow> {
    const [row] = await db.query<SyncStateRow>(
      'SELECT enabled, restoring, last_synced_at FROM sync_state WHERE id = 1',
    )
    if (!row) throw new Error('sync_state introuvable : la migration v9 a-t-elle été jouée ?')
    return row
  }

  return {
    async isEnabled(): Promise<boolean> {
      return (await state()).enabled === 1
    },

    async setEnabled(enabled: boolean): Promise<void> {
      await db.run('UPDATE sync_state SET enabled = ? WHERE id = 1', [enabled ? 1 : 0])
    },

    async getLastPulledAt(entity: string): Promise<string | null> {
      const [row] = await db.query<{ last_pulled_at: string }>(
        'SELECT last_pulled_at FROM sync_pull_cursor WHERE entity = ?',
        [entity],
      )
      return row?.last_pulled_at ?? null
    },

    async setLastPulledAt(entity: string, lastPulledAt: string): Promise<void> {
      await db.run(
        `INSERT INTO sync_pull_cursor (entity, last_pulled_at) VALUES (?, ?)
         ON CONFLICT (entity) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
        [entity, lastPulledAt],
      )
    },

    /** Le prochain pull repart du début pour chaque table ; les données locales ne bougent pas. */
    async clearPullCursors(): Promise<void> {
      await db.run('DELETE FROM sync_pull_cursor')
    },

    async getLastSyncedAt(): Promise<string | null> {
      return (await state()).last_synced_at
    },

    async setLastSyncedAt(lastSyncedAt: string): Promise<void> {
      await db.run('UPDATE sync_state SET last_synced_at = ? WHERE id = 1', [lastSyncedAt])
    },

    /** Le choix fait à la restauration, gardé jusqu'à ce que le carnet du compte soit écrit. */
    async restoreMode(): Promise<RestoreMode | null> {
      return RESTORE_MODES[(await state()).restoring] ?? null
    },

    async startRestore(mode: RestoreMode): Promise<void> {
      await db.run('UPDATE sync_state SET restoring = ? WHERE id = 1', [RESTORE_CODES[mode]])
    },
  }
}

export type SyncStateRepository = ReturnType<typeof createSyncStateRepository>
