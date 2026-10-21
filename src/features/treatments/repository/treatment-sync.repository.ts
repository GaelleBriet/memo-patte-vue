import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { createPushedRowReplacement } from '@/core/sync/repository/pushed-row-replacement'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import { COLUMNS, type TreatmentRow } from './treatment-row.repository'

export function createTreatmentSync(db: DbClient, loadClient: () => Promise<SupabaseClient>) {
  return {
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
