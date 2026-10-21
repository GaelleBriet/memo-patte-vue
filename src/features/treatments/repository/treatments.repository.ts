import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createPushedRowReplacement } from '@/core/sync/repository/pushed-row-replacement'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import { createTreatmentDosesRepository } from './treatment-doses.repository'
import { createTreatmentDeletion } from './treatment-deletion.repository'
import { createTreatmentImport } from './treatment-import.repository'
import { createTreatmentPeriodsRepository } from './treatment-periods.repository'
import { createTreatmentPlanWrites } from './treatment-plan-writes.repository'
import { createTreatmentReads } from './treatment-reads.repository'
import { COLUMNS, type TreatmentRow } from './treatment-row.repository'

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

  const reads = createTreatmentReads(db, periods, doses)

  return {
    entity: 'treatment',

    ...reads,
    ...createTreatmentPlanWrites(db, deviceId, { periods, doses, getById: reads.getById }),
    ...createTreatmentDeletion(db, deviceId, { periods, doses }),
    ...createTreatmentImport(db, deviceId),

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<TreatmentRow>(`SELECT ${COLUMNS} FROM treatment WHERE id = ?`, [
        id,
      ])
      return (rows[0] as SyncRow | undefined) ?? null
    },

    ...createRemoteSyncTable({ table: 'treatment', columns: COLUMNS, loadClient }),
    ...createPushedRowReplacement({ table: 'treatment', columns: COLUMNS }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                animal_id = excluded.animal_id, name = excluded.name, type = excluded.type,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at, created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
              WHERE excluded.updated_at > treatment.updated_at`,
        params: [
          row.id,
          syncField(row, 'animal_id'),
          syncField(row, 'name'),
          syncField(row, 'type'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
          syncField(row, 'created_by_device'),
          syncField(row, 'updated_by_device'),
        ],
      }
    },
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
