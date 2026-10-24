import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import { createSyncStateRepository } from '../repository/sync-state.repository'

/** La file d'envoi et l'état de la synchro du téléphone, tels que les cas d'usage les lisent. */
export function createLocalSyncOutbox(db: DbClient) {
  return { ...createSyncOutboxRepository(db), ...createSyncStateRepository(db) }
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
