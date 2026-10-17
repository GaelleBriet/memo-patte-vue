import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createPeriodCorrection } from './treatment-period-correction.repository'
import { createPeriodCreation } from './treatment-period-creation.repository'
import { createPeriodDeletion } from './treatment-period-deletion.repository'
import { createPeriodImport } from './treatment-period-import.repository'
import { createPeriodReads } from './treatment-period-reads.repository'
import { createPeriodStop } from './treatment-period-stop.repository'
import { createPeriodSync } from './treatment-period-sync.repository'

export { currentPeriodIdSql } from './treatment-period-reads.repository'
export type { StampedTreatmentPeriod } from './treatment-period-row.repository'
export type {
  RestoredTreatmentPeriod,
  TreatmentPeriodVersion,
} from './treatment-period-import.repository'

export interface TreatmentPeriodsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

/**
 * Écrit seul l'arrêt d'une période ; ses autres écritures sont des instructions que le repository
 * des traitements ou un service joue.
 */
export function createTreatmentPeriodsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: TreatmentPeriodsRepositoryDependencies = {},
) {
  return {
    entity: 'treatment_period',
    ...createPeriodCreation(deviceId),
    ...createPeriodCorrection(deviceId),
    ...createPeriodStop(db, deviceId),
    ...createPeriodDeletion(deviceId),
    ...createPeriodReads(db),
    ...createPeriodImport(db, deviceId),
    ...createPeriodSync(db, loadClient),
  }
}

export type TreatmentPeriodsRepository = ReturnType<typeof createTreatmentPeriodsRepository>

let repository: Promise<TreatmentPeriodsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentPeriodsRepository(): Promise<TreatmentPeriodsRepository> {
  repository ??= getDb()
    .then(createTreatmentPeriodsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
