import type { DbClient } from '@/core/db/db-client'

export interface SyncOutboxEntry {
  entity: string
  entityId: string
  queuedAt: string
  attempts: number
}

interface SyncOutboxRow {
  entity: string
  entity_id: string
  queued_at: string
  attempts: number
}

interface SyncStateRow {
  enabled: number
  restoring: number
}

/** Chaque parent avant ses enfants : l'ordre des clés étrangères Postgres, au push comme au pull. */
export const SYNC_ENTITY_ORDER = [
  'animal',
  'vaccination',
  'vaccination_injection',
  'treatment',
  'treatment_dose',
  'weight_entry',
]

const ENTITY_RANK = `CASE entity ${SYNC_ENTITY_ORDER.map((_, rank) => `WHEN ? THEN ${rank}`).join(' ')}
  ELSE ${SYNC_ENTITY_ORDER.length} END`

function toEntry(row: SyncOutboxRow): SyncOutboxEntry {
  return {
    entity: row.entity,
    entityId: row.entity_id,
    queuedAt: row.queued_at,
    attempts: row.attempts,
  }
}

export function createSyncOutboxRepository(db: DbClient) {
  async function state(): Promise<SyncStateRow> {
    const [row] = await db.query<SyncStateRow>(
      'SELECT enabled, restoring FROM sync_state WHERE id = 1',
    )
    if (!row) throw new Error('sync_state introuvable : la migration v5 a-t-elle été jouée ?')
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

    async isRestoring(): Promise<boolean> {
      return (await state()).restoring === 1
    },

    async setRestoring(restoring: boolean): Promise<void> {
      await db.run('UPDATE sync_state SET restoring = ? WHERE id = 1', [restoring ? 1 : 0])
    },

    /** Dans l'ordre de `SYNC_ENTITY_ORDER`, puis de mise en file. */
    async listPending(): Promise<SyncOutboxEntry[]> {
      const rows = await db.query<SyncOutboxRow>(
        `SELECT entity, entity_id, queued_at, attempts FROM sync_outbox
         ORDER BY ${ENTITY_RANK}, queued_at`,
        SYNC_ENTITY_ORDER,
      )
      return rows.map(toEntry)
    },

    /** Ne retire l'entrée que si `queuedAt` n'a pas bougé depuis la lecture (§3.3 de la proposition). */
    async removeIfUnchanged(
      entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>,
    ): Promise<void> {
      await db.run('DELETE FROM sync_outbox WHERE entity = ? AND entity_id = ? AND queued_at = ?', [
        entry.entity,
        entry.entityId,
        entry.queuedAt,
      ])
    },

    async clear(): Promise<void> {
      await db.run('DELETE FROM sync_outbox')
    },
  }
}

export type SyncOutboxRepository = ReturnType<typeof createSyncOutboxRepository>
