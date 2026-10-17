import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import { SYNC_COLUMN_NAMES, SYNC_COLUMNS } from './treatment-period-row.repository'
import { createPeriodReads } from './treatment-period-reads.repository'
import { createPeriodImport } from './treatment-period-import.repository'
import { createPeriodDeletion } from './treatment-period-deletion.repository'
import { createPeriodStop } from './treatment-period-stop.repository'
import { createPeriodCorrection } from './treatment-period-correction.repository'
import { createPeriodCreation } from './treatment-period-creation.repository'

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

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<SyncRow>(
        `SELECT ${SYNC_COLUMNS} FROM treatment_period WHERE id = ?`,
        [id],
      )
      return rows[0] ?? null
    },

    ...createRemoteSyncTable({ table: 'treatment_period', columns: SYNC_COLUMNS, loadClient }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
              VALUES (${SYNC_COLUMN_NAMES.map(() => '?').join(', ')})
              ON CONFLICT (id) DO UPDATE SET
                ${SYNC_COLUMN_NAMES.slice(1)
                  .map((column) => `${column} = excluded.${column}`)
                  .join(', ')}
              WHERE excluded.updated_at > treatment_period.updated_at`,
        params: SYNC_COLUMN_NAMES.map((column) => syncField(row, column)),
      }
    },
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
