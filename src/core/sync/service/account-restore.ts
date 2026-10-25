import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { RestoreMode } from '../repository/sync-state.repository'
import type { LocalSyncOutbox } from './local-sync-outbox'
import { normalizeSyncTimestamps } from './normalize-sync-timestamps'
import type { RestoreChoiceSnapshot } from './restore-choice-snapshot'
import type { RemoteBackupReads, SyncRow, SyncableTable } from './syncable-table'

const PAGE_SIZE = 500
const EPOCH = '1970-01-01T00:00:00.000Z'
const KEPT_ON_REPLACE = 'device'

export type { RestoreMode }

/** `carnet-changed` : « Remplacer » abandonné, le carnet du téléphone a changé depuis le choix. */
export type RestoreRunResult = 'restored' | 'carnet-changed'

export interface RestoreProgress {
  done: number
  total: number
}

export type RestorableTable = SyncableTable &
  RemoteBackupReads & { eraseAllStatement(): SqlStatement }

export interface AccountRestoreDependencies {
  db: DbClient
  outbox: Pick<
    LocalSyncOutbox,
    'restoreMode' | 'startRestore' | 'cancelRestore' | 'carnetFingerprint' | 'restoreStatements'
  >
  /** Dans l'ordre de `SYNC_ENTITY_ORDER` : un parent est écrit avant ses enfants. */
  tables: RestorableTable[]
  userId: () => string | null
  onRemindersOutdated: () => Promise<void>
  choiceSnapshot: RestoreChoiceSnapshot
}

interface DownloadedTable {
  table: RestorableTable
  rows: SyncRow[]
  cursor: string | null
}

type Listener = (progress: RestoreProgress) => void

/**
 * Restauration d'un compte : toute la sauvegarde est tirée d'abord, puis écrite en une seule
 * transaction ; une coupure ne laisse donc ni carnet à moitié écrit ni carnet effacé. Le choix
 * survit à un redémarrage : la restauration reprend du début à l'essai suivant. « Remplacer »
 * n'efface rien si le carnet du téléphone a changé depuis le choix : celui-ci est alors à refaire.
 */
export function createAccountRestore(deps: AccountRestoreDependencies) {
  const listeners = new Set<Listener>()
  let running: Promise<RestoreRunResult> | null = null
  let progress: RestoreProgress = { done: 0, total: 0 }

  function report(next: RestoreProgress): void {
    progress = next
    for (const listener of listeners) listener(next)
  }

  async function download(userId: string): Promise<DownloadedTable[]> {
    const counts = await Promise.all(deps.tables.map((table) => table.countRemoteRows(userId)))
    let done = 0
    const total = counts.reduce((sum, count) => sum + count, 0)
    report({ done, total })

    const downloaded: DownloadedTable[] = []
    for (const table of deps.tables) {
      const rows: SyncRow[] = []
      let since = EPOCH
      let afterId: string | undefined
      let cursor: string | null = null
      for (;;) {
        const page = await table.pullPage(userId, since, PAGE_SIZE, afterId)
        const lastRow = page.rows.at(-1)
        if (!lastRow || page.cursor === null) break
        rows.push(...page.rows.map(normalizeSyncTimestamps))
        cursor = page.cursor
        done += page.rows.length
        report({ done, total: Math.max(total, done) })
        if (page.rows.length < PAGE_SIZE) break
        since = page.cursor
        afterId = lastRow.id
      }
      downloaded.push({ table, rows, cursor })
    }
    return downloaded
  }

  function writeStatements(mode: RestoreMode, downloaded: DownloadedTable[]): SqlStatement[] {
    const { before, after } = deps.outbox.restoreStatements({
      mode,
      cursors: downloaded.flatMap(({ table, cursor }) =>
        cursor === null ? [] : [{ entity: table.entity, lastPulledAt: cursor }],
      ),
    })
    const erased =
      mode === 'replace'
        ? deps.tables
            .filter(({ entity }) => entity !== KEPT_ON_REPLACE)
            .reverse()
            .map((table) => table.eraseAllStatement())
        : []
    const applied = downloaded.flatMap(({ table, rows }) =>
      rows.map((row) => table.applyRemoteRowStatement(row)),
    )
    return [...before, ...erased, ...applied, ...after]
  }

  async function carnetChangedSinceChoice(): Promise<boolean> {
    return deps.choiceSnapshot.read() !== (await deps.outbox.carnetFingerprint())
  }

  async function restore(): Promise<RestoreRunResult> {
    const mode = await deps.outbox.restoreMode()
    const userId = deps.userId()
    if (mode === null || userId === null) return 'restored'
    const downloaded = await download(userId)
    if (deps.userId() !== userId) return 'restored'
    if (mode === 'replace' && (await carnetChangedSinceChoice())) {
      await deps.outbox.cancelRestore()
      deps.choiceSnapshot.clear()
      return 'carnet-changed'
    }
    await deps.db.runMany(writeStatements(mode, downloaded))
    deps.choiceSnapshot.clear()
    await deps.onRemindersOutdated()
    return 'restored'
  }

  return {
    pendingMode: () => deps.outbox.restoreMode(),

    /** Rien n'est écrit dans le carnet avant `run()` : seuls le choix et l'état du carnet sont gardés. */
    async start(mode: RestoreMode): Promise<void> {
      if (mode === 'replace') deps.choiceSnapshot.save(await deps.outbox.carnetFingerprint())
      await deps.outbox.startRestore(mode)
    },

    /** Une seule restauration à la fois ; lève si le réseau coupe, le choix reste en place. */
    run(): Promise<RestoreRunResult> {
      running ??= restore().finally(() => {
        running = null
      })
      return running
    },

    get progress(): RestoreProgress {
      return progress
    },

    onProgress(listener: Listener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type AccountRestore = ReturnType<typeof createAccountRestore>
