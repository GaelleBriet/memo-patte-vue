import type { SqlStatement } from '@/core/db/db-client'
import { errorSummary } from '@/shared/utils/error-summary'
import { normalizeSyncTimestamps } from './normalize-sync-timestamps'
import { keyOf, type KeptRow } from './push-cycle'
import type { SyncCycleDependencies } from './sync-cycle'
import type { SyncPullPage, SyncRow, SyncableTable } from './syncable-table'

const PULL_PAGE_SIZE = 500
const EPOCH = '1970-01-01T00:00:00.000Z'
const PULL_MARGIN_MS = 5_000

export interface PullCycle {
  pull(
    userId: string,
    keptRows: readonly KeptRow[],
    onRemindersTouched: (entity: string) => void,
  ): Promise<void>
  keepServerRows(
    keptRows: readonly KeptRow[],
    onRemindersTouched: (entity: string) => void,
  ): Promise<void>
}

/** `server_updated_at` date le début de la transaction : une ligne validée après un pull peut le précéder. */
function withMargin(lastPulledAt: string | null): string {
  if (lastPulledAt === null) return EPOCH
  return new Date(Date.parse(lastPulledAt) - PULL_MARGIN_MS).toISOString()
}

export function createPullCycle(
  deps: Pick<SyncCycleDependencies, 'db' | 'outbox' | 'tables'>,
): PullCycle {
  /** Les écritures de la synchro ne repartent pas dans la file d'envoi. */
  async function runUnqueued(statements: SqlStatement[]): Promise<void> {
    const wasEnabled = await deps.outbox.isEnabled()
    await deps.db.runMany([
      { sql: 'UPDATE sync_state SET enabled = 0 WHERE id = 1' },
      ...statements,
      { sql: 'UPDATE sync_state SET enabled = ? WHERE id = 1', params: [wasEnabled ? 1 : 0] },
    ])
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
        console.warn(
          `Ligne gardée par le serveur non reprise (${table.entity}) :`,
          errorSummary(cause),
        )
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

  /** Une ligne relue dans la marge ne touche le carnet que si elle y manque ou y est plus ancienne. */
  async function touchesCarnet(
    table: SyncableTable,
    page: SyncPullPage,
    lastPulledAt: string | null,
  ): Promise<boolean> {
    for (const [index, row] of page.rows.entries()) {
      if (lastPulledAt === null || (page.stamps[index] ?? '') > lastPulledAt) return true
      const local = await table.getRowForPush(row.id)
      if (!local || normalizeSyncTimestamps(row).updated_at > local.updated_at) return true
    }
    return false
  }

  async function pullTable(
    userId: string,
    table: SyncableTable,
    keptByKey: ReadonlyMap<string, KeptRow>,
    onCarnetTouched: () => void,
  ): Promise<void> {
    let lastPulledAt = await deps.outbox.getLastPulledAt(table.entity)
    let since = withMargin(lastPulledAt)
    let afterId: string | undefined

    for (;;) {
      const page = await table.pullPage(userId, since, PULL_PAGE_SIZE, afterId)
      const lastRow = page.rows.at(-1)
      if (!lastRow) break

      const touched = await touchesCarnet(table, page, lastPulledAt)
      await applyPage(table, page.rows, keptByKey)

      const cursor = page.cursor
      if (cursor === null) break
      if (
        afterId !== undefined &&
        !(cursor > since || (cursor === since && lastRow.id > afterId))
      ) {
        console.warn(`Pagination du pull arrêtée sans progrès pour ${table.entity}.`)
        break
      }
      if (lastPulledAt === null || cursor > lastPulledAt) {
        await deps.outbox.setLastPulledAt(table.entity, cursor)
        lastPulledAt = cursor
      }
      if (touched) onCarnetTouched()
      if (page.rows.length < PULL_PAGE_SIZE) break
      since = cursor
      afterId = lastRow.id
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

  return { pull, keepServerRows }
}
