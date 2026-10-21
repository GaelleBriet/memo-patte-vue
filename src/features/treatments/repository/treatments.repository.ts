import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createTreatmentDosesRepository } from './treatment-doses.repository'
import { createTreatmentDeletion } from './treatment-deletion.repository'
import { createTreatmentImport } from './treatment-import.repository'
import { createTreatmentPeriodsRepository } from './treatment-periods.repository'
import { createTreatmentPlanWrites } from './treatment-plan-writes.repository'
import { createTreatmentReads } from './treatment-reads.repository'
import { createTreatmentSync } from './treatment-sync.repository'

export type { StampedTreatmentRecord } from './treatment-row.repository'
export type { RestoredTreatment, TreatmentVersion } from './treatment-import.repository'

export interface TreatmentsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

export function createTreatmentsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: TreatmentsRepositoryDependencies = {},
) {
  const periods = createTreatmentPeriodsRepository(db, { deviceId })
  const doses = createTreatmentDosesRepository(db, { deviceId })
  const reads = createTreatmentReads(db, { periods, doses })

  return {
    entity: 'treatment',

    ...reads,
    ...createTreatmentPlanWrites(db, deviceId, { periods, doses, getById: reads.getById }),
    ...createTreatmentDeletion(db, deviceId, { periods, doses }),
    ...createTreatmentImport(db, deviceId),
    ...createTreatmentSync(db, loadClient),
  }
}

export type TreatmentsRepository = ReturnType<typeof createTreatmentsRepository>
export type TreatmentWithPeriodsReader = Pick<TreatmentsRepository, 'getWithPeriods'>
export type AllTreatmentsWithPeriodsReader = Pick<TreatmentsRepository, 'listAllWithPeriods'>
export type TreatmentRemover = Pick<TreatmentsRepository, 'remove' | 'restore'>

let repository: Promise<TreatmentsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentsRepository(): Promise<TreatmentsRepository> {
  repository ??= getDb()
    .then(createTreatmentsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
