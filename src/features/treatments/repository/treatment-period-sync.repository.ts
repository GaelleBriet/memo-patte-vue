import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { createPushedRowReplacement } from '@/core/sync/repository/pushed-row-replacement'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import { SYNC_COLUMN_NAMES, SYNC_COLUMNS } from './treatment-period-row.repository'
import { gridBeforeColumn, gridBeforeFromColumn } from '../schema/grid-before.schema'

function syncedGridBefore(column: unknown): string | null {
  return gridBeforeColumn(gridBeforeFromColumn(column))
}

export function createPeriodSync(db: DbClient, loadClient: () => Promise<SupabaseClient>) {
  return {
    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<SyncRow>(
        `SELECT ${SYNC_COLUMNS} FROM treatment_period WHERE id = ?`,
        [id],
      )
      const row = rows[0]
      return row ? { ...row, grid_before: syncedGridBefore(row.grid_before) } : null
    },

    ...createRemoteSyncTable({ table: 'treatment_period', columns: SYNC_COLUMNS, loadClient }),
    ...createPushedRowReplacement({ table: 'treatment_period', columns: SYNC_COLUMNS }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment_period (${SYNC_COLUMNS})
              VALUES (${SYNC_COLUMN_NAMES.map(() => '?').join(', ')})
              ON CONFLICT (id) DO UPDATE SET
                ${SYNC_COLUMN_NAMES.slice(1)
                  .map((column) => `${column} = excluded.${column}`)
                  .join(', ')}
              WHERE excluded.updated_at > treatment_period.updated_at`,
        params: SYNC_COLUMN_NAMES.map((column) =>
          column === 'grid_before' ? syncedGridBefore(row.grid_before) : syncField(row, column),
        ),
      }
    },
  }
}
