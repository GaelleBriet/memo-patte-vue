import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { RestoreMode } from '../repository/sync-state.repository'
import type { LocalSyncOutbox } from './local-sync-outbox'
import { normalizeSyncTimestamps } from './normalize-sync-timestamps'
import { remotePages } from './remote-pages'
import type { RestoreChoiceSnapshot } from './restore-choice-snapshot'
import {
  syncField,
  type RemoteBackupReads,
  type SyncRow,
  type SyncableTable,
} from './syncable-table'

const PAGE_SIZE = 500
const KEPT_ON_REPLACE = 'device'

export type { RestoreMode }

/** `nothing-to-restore` : rien d'écrit (ni choix, ni compte, ou compte changé entre-temps) ;
 * `carnet-changed` : « Remplacer » abandonné, le carnet du téléphone a changé depuis le choix ;
 * `backup-gone` : le compte n'a plus d'animal, le choix est abandonné et la sauvegarde à recontrôler. */
export type RestoreRunResult = 'restored' | 'nothing-to-restore' | 'carnet-changed' | 'backup-gone'

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
      let cursor: string | null = null
      for await (const page of remotePages(table, userId, PAGE_SIZE)) {
        rows.push(...page.rows.map(normalizeSyncTimestamps))
        cursor = page.cursor
        done += page.rows.length
        report({ done, total: Math.max(total, done) })
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

  function hasLiveAnimal(downloaded: DownloadedTable[]): boolean {
    const animals = downloaded.find(({ table }) => table.entity === 'animal')
    return (
      animals !== undefined && animals.rows.some((row) => syncField(row, 'deleted_at') === null)
    )
  }

  async function carnetChangedSinceChoice(): Promise<boolean> {
    return deps.choiceSnapshot.read() !== (await deps.outbox.carnetFingerprint())
  }

  async function restore(): Promise<RestoreRunResult> {
    const mode = await deps.outbox.restoreMode()
    const userId = deps.userId()
    if (mode === null || userId === null) return 'nothing-to-restore'
    const downloaded = await download(userId)
    if (deps.userId() !== userId) return 'nothing-to-restore'
    if (!hasLiveAnimal(downloaded)) {
      await deps.outbox.cancelRestore()
      deps.choiceSnapshot.clear()
      return 'backup-gone'
    }
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
