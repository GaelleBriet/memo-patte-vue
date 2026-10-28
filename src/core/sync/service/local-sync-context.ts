import { getDb } from '@/core/db/sqlite'
import { photoExists, readPhoto, writeDownloadedPhoto } from '@/core/photos/photo-storage'
import { photoFileArrived } from '@/core/photos/use-photo-urls'
import { createAnimalPhotoDelete } from '@/core/supabase/animal-photo-delete'
import { createAnimalPhotoDownload } from '@/core/supabase/animal-photo-download'
import { createAnimalPhotoList } from '@/core/supabase/animal-photo-list'
import { createAnimalPhotoUpload } from '@/core/supabase/animal-photo-upload'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createCarnetPhotosRepository } from '../repository/carnet-photos.repository'
import { createSyncPushRepository } from '../repository/sync-push.repository'
import { createLocalSyncOutbox, type LocalSyncOutbox } from './local-sync-outbox'
import { createAccountRestore, type AccountRestore, type RestorableTable } from './account-restore'
import { createCloudPhotoSweep, type CloudPhotoSweep } from './cloud-photo-sweep'
import { cloudPhotoSweepMemory } from './cloud-photo-sweep-memory'
import { restoreChoiceSnapshot } from './restore-choice-snapshot'
import { createPhotoRestore, type PhotoRestore } from './photo-restore'
import { createSyncCycle, type SyncCycle, type SyncCycleDependencies } from './sync-cycle'
import type { SyncableTable } from './syncable-table'

export interface LocalSyncContext {
  outbox: LocalSyncOutbox
  cycle: SyncCycle
  restore: AccountRestore
  photoRestore: PhotoRestore
  photoSweep: CloudPhotoSweep
}

export type LocalSyncContextDependencies = Omit<
  SyncCycleDependencies,
  'db' | 'outbox' | 'pushes' | 'tables' | 'onRemindersOutdated' | 'photos'
> & {
  tables: RestorableTable[]
  /** La table `animal` du cloud, lue en entier par le ménage des photos. */
  cloudAnimals: Pick<SyncableTable, 'pullPage'>
  onRemindersOutdated: () => Promise<void>
  sessionActive: () => boolean
}

/** Ouvre la base locale et compose la file d'attente, le cycle, la restauration et les photos. */
export async function createLocalSyncContext(
  deps: LocalSyncContextDependencies,
): Promise<LocalSyncContext> {
  const db = await getDb()
  const outbox = createLocalSyncOutbox(db)
  const carnetPhotos = createCarnetPhotosRepository(db)
  const pushes = createSyncPushRepository(loadSupabaseClient)
  const photos = {
    files: { read: readPhoto, exists: photoExists },
    uploads: createAnimalPhotoUpload(loadSupabaseClient),
    deletes: createAnimalPhotoDelete(loadSupabaseClient),
    isPhotoInCarnet: (fileName: string) => carnetPhotos.isPhotoInCarnet(fileName),
    isPhotoKeptByAnimal: (fileName: string) => carnetPhotos.isPhotoKeptByAnimal(fileName),
  }
  const cycle = createSyncCycle({ ...deps, db, outbox, pushes, photos })
  const restore = createAccountRestore({
    db,
    outbox,
    tables: deps.tables,
    userId: deps.userId,
    onRemindersOutdated: deps.onRemindersOutdated,
    choiceSnapshot: restoreChoiceSnapshot,
  })
  const isAccountCurrent = (userId: string) => deps.sessionActive() && deps.userId() === userId
  const photoRestore = createPhotoRestore({
    carnetPhotos: () => carnetPhotos.listCarnetPhotos(),
    files: { exists: photoExists, write: writeDownloadedPhoto },
    downloads: createAnimalPhotoDownload(loadSupabaseClient),
    isAccountCurrent,
    onPhotoRestored: photoFileArrived,
  })
  const photoSweep = createCloudPhotoSweep({
    outbox,
    cloudAnimals: deps.cloudAnimals,
    localKeptPhotos: () => carnetPhotos.listKeptPhotos(),
    objects: createAnimalPhotoList(loadSupabaseClient),
    deletes: photos.deletes,
    isEligible: deps.isEligible,
    isAccountCurrent,
    lastSweep: cloudPhotoSweepMemory,
  })
  return { outbox, cycle, restore, photoRestore, photoSweep }
}
