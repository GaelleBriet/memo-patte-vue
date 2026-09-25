import type { DbClient } from '@/core/db/db-client'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import { normalizeSyncTimestamps } from './normalize-sync-timestamps'
import type { SyncRow, SyncableTable } from './syncable-table'

const PUSH_CLAIM_SIZE = 200
const PULL_PAGE_SIZE = 500
const EPOCH = '1970-01-01T00:00:00.000Z'
const REMINDER_ENTITIES = new Set(['animal', 'vaccination', 'treatment'])

export interface SyncCycleOutbox {
  listPending(): Promise<SyncOutboxEntry[]>
  removeIfUnchanged(entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>): Promise<void>
  getLastPulledAt(entity: string): Promise<string | null>
  setLastPulledAt(entity: string, lastPulledAt: string): Promise<void>
  isEnabled(): Promise<boolean>
}

export interface SyncCycleDependencies {
  db: DbClient
  outbox: SyncCycleOutbox
  /** Ordre imposé par la clé étrangère Postgres : animal, vaccination, treatment, weight_entry. */
  tables: SyncableTable[]
  userId: () => string | null
  isEligible: () => boolean
  /** Reconstruit les rappels : injecté plutôt qu'importé, `core/sync` reste indépendant des features. */
  onRemindersOutdated?: () => Promise<void>
}

export interface SyncCycle {
  runCycle(): Promise<void>
}

export function createSyncCycle(deps: SyncCycleDependencies): SyncCycle {
  const tablesByEntity = new Map(deps.tables.map((table) => [table.entity, table]))

  async function push(userId: string): Promise<void> {
    for (;;) {
      const claimed = (await deps.outbox.listPending()).slice(0, PUSH_CLAIM_SIZE)
      if (claimed.length === 0) return

      for (const entry of claimed) {
        const table = tablesByEntity.get(entry.entity)
        if (table) {
          const row = await table.getRowForPush(entry.entityId)
          if (row) await table.pushRow(userId, row)
        }
        await deps.outbox.removeIfUnchanged(entry)
      }

      if (claimed.length < PUSH_CLAIM_SIZE) return
    }
  }

  async function applyPage(table: SyncableTable, rows: SyncRow[]): Promise<void> {
    const wasEnabled = await deps.outbox.isEnabled()
    const normalized = rows.map(normalizeSyncTimestamps)
    await deps.db.runMany([
      { sql: 'UPDATE sync_state SET enabled = 0 WHERE id = 1' },
      ...normalized.map((row) => table.applyRemoteRowStatement(row)),
      { sql: 'UPDATE sync_state SET enabled = ? WHERE id = 1', params: [wasEnabled ? 1 : 0] },
    ])
  }

  /** Vrai si la table a ramené une ligne plus récente que son curseur. */
  async function pullTable(userId: string, table: SyncableTable): Promise<boolean> {
    const since = (await deps.outbox.getLastPulledAt(table.entity)) ?? EPOCH
    let pageCursor = since

    for (;;) {
      const page = await table.pullPage(userId, pageCursor, PULL_PAGE_SIZE)
      if (page.rows.length === 0) break

      await applyPage(table, page.rows)

      const cursor = page.cursor
      if (cursor === null || cursor <= pageCursor) {
        if (page.rows.length >= PULL_PAGE_SIZE) {
          console.warn(`Pagination du pull arrêtée sans progrès pour ${table.entity}.`)
        }
        break
      }
      await deps.outbox.setLastPulledAt(table.entity, cursor)
      pageCursor = cursor
      if (page.rows.length < PULL_PAGE_SIZE) break
    }

    return pageCursor !== since
  }

  async function pull(userId: string): Promise<void> {
    let touchedReminders = false
    for (const table of deps.tables) {
      const progressed = await pullTable(userId, table)
      if (progressed && REMINDER_ENTITIES.has(table.entity)) touchedReminders = true
    }
    if (touchedReminders) await deps.onRemindersOutdated?.()
  }

  return {
    async runCycle(): Promise<void> {
      if (!deps.isEligible()) return
      const userId = deps.userId()
      if (!userId) return

      await push(userId)
      await pull(userId)
    },
  }
}
