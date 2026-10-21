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

interface KeptRow {
  table: SyncableTable
  entry: SyncOutboxEntry
  sent: SyncRow
  kept: SyncRow
}

const keyOf = (entity: string, id: string) => `${entity}/${id}`

const sameRow = (sent: SyncRow, kept: SyncRow) =>
  Object.keys(kept).every((column) => (sent[column] ?? null) === (kept[column] ?? null))

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

  /** Rend les lignes que le serveur a gardées autrement qu'envoyées : elles restent en file d'ici leur reprise. */
  async function push(userId: string): Promise<KeptRow[]> {
    const keptRows: KeptRow[] = []
    const handled = new Set<string>()
    let envoi: SyncPush | null = null
    for (;;) {
      const claimed = (await deps.outbox.listPending())
        .filter(({ entity, entityId }) => !handled.has(keyOf(entity, entityId)))
        .slice(0, PUSH_CLAIM_SIZE)
      if (claimed.length === 0) return keptRows
      envoi ??= await deps.pushes.open(userId, new Date().toISOString())

      for (const entry of claimed) {
        handled.add(keyOf(entry.entity, entry.entityId))
        const table = tablesByEntity.get(entry.entity)
        const sent = table ? await table.getRowForPush(entry.entityId) : null
        const kept = table && sent ? await table.pushRow(userId, sent, envoi) : null
        const normalized = kept && normalizeSyncTimestamps(kept)
        if (table && sent && normalized && !sameRow(sent, normalized)) {
          keptRows.push({ table, entry, sent, kept: normalized })
        } else {
          await deps.outbox.removeIfUnchanged(entry)
        }
      }

      if (claimed.length < PUSH_CLAIM_SIZE) return keptRows
    }
  }

  /**
   * Après le pull, les parents d'une ligne gardée sont là. Une reprise impossible ne fait jamais
   * échouer le cycle : la ligne reste en file et repart au suivant.
   */
  async function keepServerRows(
    keptRows: readonly KeptRow[],
    onRemindersTouched: (entity: string) => void,
  ): Promise<void> {
    for (const { table, entry, sent, kept } of keptRows) {
      try {
        await runUnqueued([table.replacePushedRowStatement(kept, sent.updated_at)])
        await deps.outbox.removeIfUnchanged(entry)
        onRemindersTouched(table.entity)
      } catch (cause) {
        console.warn(`Ligne gardée par le serveur non reprise (${table.entity}) :`, cause)
      }
    }
  }

  /**
   * Une ligne tirée plus récente que celle gardée à l'envoi la remplace pour la reprise : la ligne
   * locale, encore datée par l'horloge du téléphone, refuserait sinon la garde du pull.
   */
  async function applyPage(
    table: SyncableTable,
    rows: SyncRow[],
    keptByKey: ReadonlyMap<string, KeptRow>,
  ): Promise<void> {
    const normalized = rows.map(normalizeSyncTimestamps)
    await runUnqueued(normalized.map((row) => table.applyRemoteRowStatement(row)))
    for (const row of normalized) {
      const kept = keptByKey.get(keyOf(table.entity, row.id))
      if (kept && row.updated_at > kept.kept.updated_at) kept.kept = row
    }
  }

  async function pullTable(
    userId: string,
    table: SyncableTable,
    keptByKey: ReadonlyMap<string, KeptRow>,
    onCursorAdvanced: () => void,
  ): Promise<void> {
    let pageCursor = (await deps.outbox.getLastPulledAt(table.entity)) ?? EPOCH

    for (;;) {
      const page = await table.pullPage(userId, pageCursor, PULL_PAGE_SIZE)
      if (page.rows.length === 0) break

      await applyPage(table, page.rows, keptByKey)

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

  async function pull(
    userId: string,
    keptRows: readonly KeptRow[],
    onRemindersTouched: (entity: string) => void,
  ): Promise<void> {
    const keptByKey = new Map(
      keptRows.map((kept) => [keyOf(kept.table.entity, kept.sent.id), kept]),
    )
    for (const table of deps.tables) {
      await pullTable(userId, table, keptByKey, () => onRemindersTouched(table.entity))
    }
  }

  return {
    /** Une ligne passée derrière son curseur ne revient plus : ses rappels se reconstruisent même si la suite échoue. */
    async runCycle(): Promise<void> {
      if (!deps.isEligible()) return
      const userId = deps.userId()
      if (!userId) return
      if (!(await deps.outbox.isEnabled())) return

      let touchedReminders = false
      const onRemindersTouched = (entity: string) => {
        if (REMINDER_ENTITIES.has(entity)) touchedReminders = true
      }
      let keptRows: KeptRow[] = []
      try {
        keptRows = await push(userId)
        await pull(userId, keptRows, onRemindersTouched)
      } finally {
        await keepServerRows(keptRows, onRemindersTouched)
        if (touchedReminders) await deps.onRemindersOutdated?.()
      }
      await deps.outbox.setLastSyncedAt(new Date().toISOString())
    },
  }
}
