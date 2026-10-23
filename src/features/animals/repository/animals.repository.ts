import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createAnimalDeparture } from './animal-departure.repository'
import { createAnimalImport } from './animal-import.repository'
import { createAnimalReads } from './animal-reads.repository'
import { createAnimalSync } from './animal-sync.repository'
import { createAnimalWrites } from './animal-writes.repository'

export type { AnimalVersion, RestoredAnimal } from './animal-import.repository'

export interface AnimalsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

export function createAnimalsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: AnimalsRepositoryDependencies = {},
) {
  const reads = createAnimalReads(db)

  return {
    entity: 'animal',

    ...reads,
    ...createAnimalWrites(db, deviceId, reads),
    ...createAnimalDeparture(db, deviceId),
    ...createAnimalImport(db, deviceId),
    ...createAnimalSync(db, loadClient),
  }
}

export type AnimalsRepository = ReturnType<typeof createAnimalsRepository>

let repository: Promise<AnimalsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getAnimalsRepository(): Promise<AnimalsRepository> {
  repository ??= getDb()
    .then(createAnimalsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
