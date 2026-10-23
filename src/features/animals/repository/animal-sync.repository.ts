import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { createPushedRowReplacement } from '@/core/sync/repository/pushed-row-replacement'
import { createRemoteSyncTable } from '@/core/sync/repository/remote-sync-table.repository'
import { syncField } from '@/core/sync/service/syncable-table'
import { COLUMNS, type AnimalRow } from './animal-row.repository'

export function createAnimalSync(db: DbClient, loadClient: () => Promise<SupabaseClient>) {
  return {
    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<AnimalRow>(`SELECT ${COLUMNS} FROM animal WHERE id = ?`, [id])
      return (rows[0] as SyncRow | undefined) ?? null
    },

    ...createRemoteSyncTable({ table: 'animal', columns: COLUMNS, loadClient }),
    ...createPushedRowReplacement({ table: 'animal', columns: COLUMNS }),

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO animal (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                name = excluded.name, species = excluded.species, breed = excluded.breed,
                birth_date = excluded.birth_date,
                birth_date_approximate = excluded.birth_date_approximate,
                photo_path = excluded.photo_path, unfollowed_on = excluded.unfollowed_on,
                departure_reason = excluded.departure_reason,
                departure_date = excluded.departure_date, created_at = excluded.created_at,
                updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
                created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
              WHERE excluded.updated_at > animal.updated_at`,
        params: [
          row.id,
          syncField(row, 'name'),
          syncField(row, 'species'),
          syncField(row, 'breed'),
          syncField(row, 'birth_date'),
          syncField(row, 'birth_date_approximate'),
          syncField(row, 'photo_path'),
          syncField(row, 'unfollowed_on'),
          syncField(row, 'departure_reason'),
          syncField(row, 'departure_date'),
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
