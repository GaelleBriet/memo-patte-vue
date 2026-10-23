import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createVaccinationCascade } from './vaccination-cascade.repository'
import { createVaccinationImport } from './vaccination-import.repository'
import { createVaccinationInjectionsRepository } from './vaccination-injections.repository'
import { createVaccinationReads } from './vaccination-reads.repository'
import { createVaccinationSync } from './vaccination-sync.repository'
import { createVaccinationWrites } from './vaccination-writes.repository'

export type {
  RestoredVaccination,
  VaccinationRecord,
  VaccinationVersion,
} from './vaccination-row.repository'

export interface VaccinationsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

export function createVaccinationsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: VaccinationsRepositoryDependencies = {},
) {
  const injections = createVaccinationInjectionsRepository(db, { deviceId })
  const reads = createVaccinationReads(db, injections)

  return {
    entity: 'vaccination',

    ...reads,
    ...createVaccinationWrites(db, deviceId, injections, reads),
    ...createVaccinationCascade(deviceId),
    ...createVaccinationImport(db, deviceId),
    ...createVaccinationSync(db, loadClient),
  }
}

export type VaccinationsRepository = ReturnType<typeof createVaccinationsRepository>
export type AllVaccinationsReader = Pick<VaccinationsRepository, 'listAll'>
export type VaccinationReplacedDuesReader = Pick<
  VaccinationsRepository,
  'getById' | 'listReplacedDues'
>

let repository: Promise<VaccinationsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getVaccinationsRepository(): Promise<VaccinationsRepository> {
  repository ??= getDb()
    .then(createVaccinationsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
