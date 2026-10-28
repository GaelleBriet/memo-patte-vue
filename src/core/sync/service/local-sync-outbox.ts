import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { createCarnetFingerprintRepository } from '../repository/carnet-fingerprint.repository'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import { createSyncStateRepository, type RestoreMode } from '../repository/sync-state.repository'

export function createLocalSyncOutbox(db: DbClient) {
  const outbox = createSyncOutboxRepository(db)
  const syncState = createSyncStateRepository(db)
  const fingerprint = createCarnetFingerprintRepository(db)

  return {
    isEnabled: syncState.isEnabled,
    setEnabled: syncState.setEnabled,
    getLastPulledAt: syncState.getLastPulledAt,
    setLastPulledAt: syncState.setLastPulledAt,
    clearPullCursors: syncState.clearPullCursors,
    getLastSyncedAt: syncState.getLastSyncedAt,
    setLastSyncedAt: syncState.setLastSyncedAt,
    restoreMode: syncState.restoreMode,
    startRestore: syncState.startRestore,
    cancelRestore: syncState.cancelRestore,
    unqueuedStatements: syncState.unqueuedStatements,
    carnetFingerprint: fingerprint.read,
    countWholeCarnet: outbox.countWholeCarnet,
    countPending: outbox.countPending,
    countRefused: outbox.countRefused,
    countRefusedPhotos: outbox.countRefusedPhotos,
    listPending: outbox.listPending,
    removeIfUnchanged: outbox.removeIfUnchanged,
    markRefusedWithRefusedAncestor: outbox.markRefusedWithRefusedAncestor,
    markRefusedIfUnchanged: outbox.markRefusedIfUnchanged,
    recordFailedPush: outbox.recordFailedPush,
    clear: outbox.clear,

    async enableAndQueueWholeCarnet(): Promise<void> {
      await db.runMany([
        ...syncState.enableFromStartStatements(),
        ...outbox.queueWholeCarnetStatements(),
      ])
    },

    async enableAndQueueLiveCarnet(): Promise<void> {
      await db.runMany([
        ...syncState.enableFromStartStatements(),
        ...outbox.queueLiveCarnetStatements(),
      ])
    },

    /**
     * Autour du carnet tiré : synchro coupée pendant l'écriture. Avant l'écriture, « Fusionner »
     * met en file tout le carnet du téléphone et ses photos, « Remplacer » seulement ses appareils.
     */
    restoreStatements({
      mode,
      cursors,
    }: {
      mode: RestoreMode
      cursors: ReadonlyArray<{ entity: string; lastPulledAt: string }>
    }): { before: SqlStatement[]; after: SqlStatement[] } {
      return {
        before: [
          ...syncState.pauseForRestoreStatements(),
          ...(mode === 'merge'
            ? outbox.queueWholeCarnetStatements()
            : outbox.keepPhotosAndQueueDevicesStatements()),
        ],
        after: syncState.finishRestoreStatements(cursors),
      }
    },

    /**
     * Déconnexion (§5 de la proposition) : le compte suivant ne reçoit ni la file, ni les curseurs,
     * ni la dernière sauvegarde du précédent.
     */
    async forgetAccount(): Promise<void> {
      await db.runMany([
        syncState.resetStatement(),
        outbox.clearStatement(),
        syncState.clearCursorsStatement(),
      ])
    },

    eraseAllStatements(): SqlStatement[] {
      return [
        outbox.clearStatement(),
        syncState.clearCursorsStatement(),
        syncState.resetStatement(),
      ]
    },
  }
}

export type LocalSyncOutbox = ReturnType<typeof createLocalSyncOutbox>

let localSyncOutbox: Promise<LocalSyncOutbox> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getLocalSyncOutbox(): Promise<LocalSyncOutbox> {
  localSyncOutbox ??= getDb()
    .then(createLocalSyncOutbox)
    .catch((cause: unknown) => {
      localSyncOutbox = null
      throw cause
    })
  return localSyncOutbox
}
