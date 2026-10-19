import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import { normalizeSyncTimestamps } from './normalize-sync-timestamps'
import type { SyncPush, SyncRow, SyncableTable } from './syncable-table'

const PUSH_CLAIM_SIZE = 200
const PULL_PAGE_SIZE = 500
const EPOCH = '1970-01-01T00:00:00.000Z'
const REMINDER_ENTITIES = new Set([
  'animal',
  'vaccination',
  'vaccination_injection',
  'treatment',
  'treatment_period',
  'treatment_dose',
  'carnet_settings',
])

export interface SyncCycleOutbox {
  listPending(): Promise<SyncOutboxEntry[]>
  removeIfUnchanged(entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>): Promise<void>
  getLastPulledAt(entity: string): Promise<string | null>
  setLastPulledAt(entity: string, lastPulledAt: string): Promise<void>
  isEnabled(): Promise<boolean>
  setLastSyncedAt(lastSyncedAt: string): Promise<void>
}

export interface SyncCyclePushes {
  open(userId: string, sentAt: string): Promise<SyncPush>
}

export interface SyncCycleDependencies {
  db: DbClient
  outbox: SyncCycleOutbox
  pushes: SyncCyclePushes
  /** Dans l'ordre de `SYNC_ENTITY_ORDER` : un parent est tiré avant ses enfants. */
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

  /** Les écritures de la synchro ne repartent pas dans la file d'envoi. */
  async function runUnqueued(statements: SqlStatement[]): Promise<void> {
    const wasEnabled = await deps.outbox.isEnabled()
    await deps.db.runMany([
      { sql: 'UPDATE sync_state SET enabled = 0 WHERE id = 1' },
      ...statements,
      { sql: 'UPDATE sync_state SET enabled = ? WHERE id = 1', params: [wasEnabled ? 1 : 0] },
    ])
  }

  async function keepServerRow(
    table: SyncableTable,
    sent: SyncRow,
    kept: SyncRow,
    onReplaced: () => void,
  ): Promise<void> {
    const normalized = normalizeSyncTimestamps(kept)
    const unchanged = Object.keys(normalized).every(
      (column) => (sent[column] ?? null) === (normalized[column] ?? null),
    )
    if (unchanged) return
    await runUnqueued([table.replacePushedRowStatement(normalized, sent.updated_at)])
    onReplaced()
  }

  async function push(userId: string, onRemindersTouched: (entity: string) => void): Promise<void> {
    let envoi: SyncPush | null = null
    for (;;) {
      const claimed = (await deps.outbox.listPending()).slice(0, PUSH_CLAIM_SIZE)
      if (claimed.length === 0) return
      envoi ??= await deps.pushes.open(userId, new Date().toISOString())

      for (const entry of claimed) {
        const table = tablesByEntity.get(entry.entity)
        if (table) {
          const row = await table.getRowForPush(entry.entityId)
          const kept = row && (await table.pushRow(userId, row, envoi))
          if (row && kept) {
            await keepServerRow(table, row, kept, () => onRemindersTouched(table.entity))
          }
        }
        await deps.outbox.removeIfUnchanged(entry)
      }

      if (claimed.length < PUSH_CLAIM_SIZE) return
    }
  }

  async function applyPage(table: SyncableTable, rows: SyncRow[]): Promise<void> {
    const normalized = rows.map(normalizeSyncTimestamps)
    await runUnqueued(normalized.map((row) => table.applyRemoteRowStatement(row)))
  }

  async function pullTable(
    userId: string,
    table: SyncableTable,
    onCursorAdvanced: () => void,
  ): Promise<void> {
    let pageCursor = (await deps.outbox.getLastPulledAt(table.entity)) ?? EPOCH

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
      onCursorAdvanced()
      pageCursor = cursor
      if (page.rows.length < PULL_PAGE_SIZE) break
    }
  }

  async function pull(userId: string, onRemindersTouched: (entity: string) => void): Promise<void> {
    for (const table of deps.tables) {
      await pullTable(userId, table, () => onRemindersTouched(table.entity))
    }
  }

  return {
    /**
     * Une ligne passée derrière son curseur ne revient plus : ses rappels se reconstruisent même si
     * la suite du cycle échoue.
     */
    async runCycle(): Promise<void> {
      if (!deps.isEligible()) return
      const userId = deps.userId()
      if (!userId) return

      let touchedReminders = false
      const onRemindersTouched = (entity: string) => {
        if (REMINDER_ENTITIES.has(entity)) touchedReminders = true
      }
      try {
        await push(userId, onRemindersTouched)
        await pull(userId, onRemindersTouched)
      } finally {
        if (touchedReminders) await deps.onRemindersOutdated?.()
      }
      await deps.outbox.setLastSyncedAt(new Date().toISOString())
    },
  }
}
