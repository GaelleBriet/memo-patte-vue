import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import { COLUMNS, PLACEHOLDERS, type DoseRow } from './treatment-dose-row.repository'

export function createDoseSync(db: DbClient, loadClient: () => Promise<SupabaseClient>) {
  return {
    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<DoseRow>(`SELECT ${COLUMNS} FROM treatment_dose WHERE id = ?`, [
        id,
      ])
      return (rows[0] as SyncRow | undefined) ?? null
    },

    ...createRemoteSyncTable({ table: 'treatment_dose', columns: COLUMNS, loadClient }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment_dose (${COLUMNS})
              VALUES (${PLACEHOLDERS})
              ON CONFLICT (id) DO UPDATE SET
                period_id = excluded.period_id, treatment_id = excluded.treatment_id,
                animal_id = excluded.animal_id, due_on = excluded.due_on,
                due_time = excluded.due_time, given_on = excluded.given_on,
                status = excluded.status, target_on = excluded.target_on,
                previous_target_on = excluded.previous_target_on,
                previous_target_time = excluded.previous_target_time,
                due_rank = excluded.due_rank,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at, created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
              WHERE excluded.updated_at > treatment_dose.updated_at`,
        params: [
          row.id,
          syncField(row, 'period_id'),
          syncField(row, 'treatment_id'),
          syncField(row, 'animal_id'),
          syncField(row, 'due_on'),
          syncField(row, 'due_time'),
          syncField(row, 'given_on'),
          syncField(row, 'status'),
          syncField(row, 'target_on'),
          syncField(row, 'previous_target_on'),
          syncField(row, 'previous_target_time'),
          syncField(row, 'due_rank'),
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
