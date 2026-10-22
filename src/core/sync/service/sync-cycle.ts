import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import { normalizeSyncTimestamps } from './normalize-sync-timestamps'
import { createPushRefusals } from './push-refusals'
import type { SyncPullPage, SyncPush, SyncRow, SyncableTable } from './syncable-table'

const PUSH_CLAIM_SIZE = 200
const PULL_PAGE_SIZE = 500
const EPOCH = '1970-01-01T00:00:00.000Z'
const PULL_MARGIN_MS = 5_000
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
  recordFailedPush(entry: Pick<SyncOutboxEntry, 'entity' | 'entityId'>): Promise<void>
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

interface PushOutcome {
  keptRows: KeptRow[]
  failure: { cause: unknown } | null
}

const keyOf = (entity: string, id: string) => `${entity}/${id}`

/** `server_updated_at` date le début de la transaction : une ligne validée après un pull peut le précéder. */
function withMargin(lastPulledAt: string | null): string {
  if (lastPulledAt === null) return EPOCH
  return new Date(Date.parse(lastPulledAt) - PULL_MARGIN_MS).toISOString()
}

const sameRow = (sent: SyncRow, kept: SyncRow) =>
  Object.keys(kept).every((column) => (sent[column] ?? null) === (kept[column] ?? null))

export function createSyncCycle(deps: SyncCycleDependencies): SyncCycle {
  const tablesByEntity = new Map(deps.tables.map((table) => [table.entity, table]))
  const refusals = createPushRefusals()

  /** Les écritures de la synchro ne repartent pas dans la file d'envoi. */
  async function runUnqueued(statements: SqlStatement[]): Promise<void> {
    const wasEnabled = await deps.outbox.isEnabled()
    await deps.db.runMany([
      { sql: 'UPDATE sync_state SET enabled = 0 WHERE id = 1' },
      ...statements,
      { sql: 'UPDATE sync_state SET enabled = ? WHERE id = 1', params: [wasEnabled ? 1 : 0] },
    ])
  }

  async function pushEntry(
    userId: string,
    entry: SyncOutboxEntry,
    envoi: SyncPush,
    keptRows: KeptRow[],
  ): Promise<void> {
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

  /** Rend vrai si l'entrée reste en file pour un prochain essai. */
  async function recordFailure(entry: SyncOutboxEntry, cause: unknown): Promise<boolean> {
    await deps.outbox.recordFailedPush(entry)
    if (!refusals.isGivenUp(entry, cause)) return true
    await deps.outbox.removeIfUnchanged(entry)
    console.warn(`Ligne refusée par le serveur, sortie de la file (${entry.entity}) :`, cause)
    return false
  }

  /**
   * Une ligne qui échoue reste en file sans retenir les suivantes ; le premier échec est rendu pour
   * être levé après le pull. Les lignes gardées par le serveur autrement qu'envoyées restent en file
   * d'ici leur reprise.
   */
  async function push(userId: string): Promise<PushOutcome> {
    const keptRows: KeptRow[] = []
    let failure: PushOutcome['failure'] = null
    const handled = new Set<string>()
    let envoi: SyncPush | null = null
    for (;;) {
      const claimed = (await deps.outbox.listPending())
        .filter(({ entity }) => entity !== ANIMAL_PHOTO_ENTITY)
        .filter(({ entity, entityId }) => !handled.has(keyOf(entity, entityId)))
        .slice(0, PUSH_CLAIM_SIZE)
      if (claimed.length === 0) return { keptRows, failure }
      try {
        envoi ??= await deps.pushes.open(userId, new Date().toISOString())
      } catch (cause) {
        return { keptRows, failure: failure ?? { cause } }
      }

      for (const entry of claimed) {
        handled.add(keyOf(entry.entity, entry.entityId))
        try {
          await pushEntry(userId, entry, envoi, keptRows)
          refusals.forget(entry)
        } catch (cause) {
          if (await recordFailure(entry, cause)) failure ??= { cause }
        }
      }

      if (claimed.length < PUSH_CLAIM_SIZE) return { keptRows, failure }
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
      let pushFailure: PushOutcome['failure'] = null
      try {
        const pushed = await push(userId)
        keptRows = pushed.keptRows
        pushFailure = pushed.failure
        await pull(userId, keptRows, onRemindersTouched)
      } finally {
        await keepServerRows(keptRows, onRemindersTouched)
        if (touchedReminders) await deps.onRemindersOutdated?.()
      }
      if (pushFailure) throw pushFailure.cause
      await deps.outbox.setLastSyncedAt(new Date().toISOString())
    },
  }
}
