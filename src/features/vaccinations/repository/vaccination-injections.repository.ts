import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createVaccinationInjectionImport } from './vaccination-injection-import.repository'
import { createVaccinationInjectionReads } from './vaccination-injection-reads.repository'
import { createVaccinationInjectionStatements } from './vaccination-injection-statements.repository'
import { createVaccinationInjectionSync } from './vaccination-injection-sync.repository'
import { createVaccinationInjectionWrites } from './vaccination-injection-writes.repository'

export { headInjectionIdSql } from './vaccination-injection-row.repository'
export type {
  RestoredVaccinationInjection,
  VaccinationInjectionRecord,
  VaccinationInjectionVersion,
} from './vaccination-injection-row.repository'

export interface VaccinationInjectionsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

/**
 * Écrit seul une injection notée ou annulée ; ses autres écritures sont des instructions que le
 * repository des vaccins ou un service joue.
 */
export function createVaccinationInjectionsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: VaccinationInjectionsRepositoryDependencies = {},
) {
  const reads = createVaccinationInjectionReads(db)
  const statements = createVaccinationInjectionStatements(deviceId)

  return {
    entity: 'vaccination_injection',

    ...reads,
    ...statements,
    ...createVaccinationInjectionWrites(db, deviceId, reads, statements),
    ...createVaccinationInjectionImport(),
    ...createVaccinationInjectionSync(db, loadClient),
  }
}

export type VaccinationInjectionsRepository = ReturnType<
  typeof createVaccinationInjectionsRepository
>

let repository: Promise<VaccinationInjectionsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getVaccinationInjectionsRepository(): Promise<VaccinationInjectionsRepository> {
  repository ??= getDb()
    .then(createVaccinationInjectionsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
