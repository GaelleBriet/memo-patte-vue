import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createDoseBatch } from './treatment-dose-batch.repository'
import { createDoseCascadeStatements } from './treatment-dose-cascade-statements.repository'
import { restoreStatement } from './treatment-dose-import.repository'
import { createDoseLineStatements } from './treatment-dose-line-statements.repository'
import { createDoseReads } from './treatment-dose-reads.repository'
import { createDoseSync } from './treatment-dose-sync.repository'

export { ConcurrentWriteError } from './treatment-dose-batch.repository'
export { DuplicateDueError } from './treatment-dose-guards.repository'
export type { RestoredTreatmentDose } from './treatment-dose-import.repository'
export type { TreatmentDoseVersion } from './treatment-dose-reads.repository'

export interface TreatmentDosesRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

export function createTreatmentDosesRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: TreatmentDosesRepositoryDependencies = {},
) {
  const { reviveStatement, ...lineStatements } = createDoseLineStatements(deviceId)

  return {
    entity: 'treatment_dose',
    ...createDoseReads(db),
    ...lineStatements,
    ...createDoseBatch(db, { ...lineStatements, reviveStatement }),
    ...createDoseCascadeStatements(deviceId),
    reviveStatement,
    restoreStatement,
    ...createDoseSync(db, loadClient),
  }
}

export type TreatmentDosesRepository = ReturnType<typeof createTreatmentDosesRepository>
export type TreatmentDoseWriter = Pick<TreatmentDosesRepository, 'applyBatch'>

let repository: Promise<TreatmentDosesRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentDosesRepository(): Promise<TreatmentDosesRepository> {
  repository ??= getDb()
    .then(createTreatmentDosesRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
