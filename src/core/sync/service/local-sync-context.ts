import { getDb } from '@/core/db/sqlite'
import { photoExists, readPhoto, writeDownloadedPhoto } from '@/core/photos/photo-storage'
import { photoFileArrived } from '@/core/photos/use-photo-urls'
import { createAnimalPhotoDelete } from '@/core/supabase/animal-photo-delete'
import { createAnimalPhotoDownload } from '@/core/supabase/animal-photo-download'
import { createAnimalPhotoUpload } from '@/core/supabase/animal-photo-upload'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import { createSyncPushRepository } from '../repository/sync-push.repository'
import { createAccountRestore, type AccountRestore, type RestorableTable } from './account-restore'
import { createPhotoRestore, type PhotoRestore } from './photo-restore'
import { createSyncCycle, type SyncCycle, type SyncCycleDependencies } from './sync-cycle'

export interface LocalSyncContext {
  outbox: ReturnType<typeof createSyncOutboxRepository>
  cycle: SyncCycle
  restore: AccountRestore
  photoRestore: PhotoRestore
}

export type LocalSyncContextDependencies = Omit<
  SyncCycleDependencies,
  'db' | 'outbox' | 'pushes' | 'tables' | 'onRemindersOutdated' | 'photos'
> & {
  tables: RestorableTable[]
  onRemindersOutdated: () => Promise<void>
  sessionActive: () => boolean
}

/**
 * Ouvre la base locale et compose la file d'attente, le cycle, la restauration et ses photos : le
 * seul point, hors de `core/db`, autorisé à appeler `getDb()` (règle ESLint
 * `app/repository-only-data-access`).
 */
export async function createLocalSyncContext(
  deps: LocalSyncContextDependencies,
): Promise<LocalSyncContext> {
  const db = await getDb()
  const outbox = createSyncOutboxRepository(db)
  const pushes = createSyncPushRepository(loadSupabaseClient)
  const photos = {
    files: { read: readPhoto, exists: photoExists },
    uploads: createAnimalPhotoUpload(loadSupabaseClient),
    deletes: createAnimalPhotoDelete(loadSupabaseClient),
    isPhotoInCarnet: (fileName: string) => outbox.isPhotoInCarnet(fileName),
    isPhotoKeptByAnimal: (fileName: string) => outbox.isPhotoKeptByAnimal(fileName),
  }
  const cycle = createSyncCycle({ ...deps, db, outbox, pushes, photos })
  const restore = createAccountRestore({
    db,
    outbox,
    tables: deps.tables,
    userId: deps.userId,
    onRemindersOutdated: deps.onRemindersOutdated,
  })
  const photoRestore = createPhotoRestore({
    carnetPhotos: () => outbox.listCarnetPhotos(),
    files: { exists: photoExists, write: writeDownloadedPhoto },
    downloads: createAnimalPhotoDownload(loadSupabaseClient),
    isAccountCurrent: (userId) => deps.sessionActive() && deps.userId() === userId,
    onPhotoRestored: photoFileArrived,
  })
  return { outbox, cycle, restore, photoRestore }
}
