import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { errorSummary } from '@/shared/utils/error-summary'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import { normalizeSyncTimestamps } from './normalize-sync-timestamps'
import { createPushRefusals } from './push-refusals'
import type { SyncCycleDependencies } from './sync-cycle'
import type { SyncPush, SyncRow, SyncableTable } from './syncable-table'

const PUSH_CLAIM_SIZE = 200

export interface KeptRow {
  table: SyncableTable
  entry: SyncOutboxEntry
  sent: SyncRow
  kept: SyncRow
}

export interface PushOutcome {
  keptRows: KeptRow[]
  failure: { cause: unknown } | null
}

export interface PushCycle {
  push(userId: string): Promise<PushOutcome>
}

export const keyOf = (entity: string, id: string) => `${entity}/${id}`

const sameRow = (sent: SyncRow, kept: SyncRow) =>
  Object.keys(kept).every((column) => (sent[column] ?? null) === (kept[column] ?? null))

export function createPushCycle(
  deps: Pick<SyncCycleDependencies, 'outbox' | 'pushes' | 'tables'>,
  now: () => Date,
): PushCycle {
  const tablesByEntity = new Map(deps.tables.map((table) => [table.entity, table]))
  const refusals = createPushRefusals({
    outbox: deps.outbox,
    onGivenUp: (entry, cause) =>
      console.warn(
        `Ligne refusée par le serveur, plus envoyée (${entry.entity}) :`,
        errorSummary(cause),
      ),
    now,
  })

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
        envoi ??= await deps.pushes.open(userId, now().toISOString())
      } catch (cause) {
        return { keptRows, failure: failure ?? { cause } }
      }

      for (const entry of claimed) {
        handled.add(keyOf(entry.entity, entry.entityId))
        try {
          await pushEntry(userId, entry, envoi, keptRows)
          refusals.forget(entry)
        } catch (cause) {
          if (await refusals.recordFailure(entry, cause)) failure ??= { cause }
        }
      }

      if (claimed.length < PUSH_CLAIM_SIZE) return { keptRows, failure }
    }
  }

  return { push }
}
