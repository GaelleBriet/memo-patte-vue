import type { SupabaseClient } from '@supabase/supabase-js'

import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import type { SyncableTable } from '@/core/sync/service/syncable-table'

export interface RemoteSyncTableOptions {
  table: string
  /** Colonnes lues au pull, séparées par des virgules, comme dans le `SELECT` local. */
  columns: string
  loadClient: () => Promise<SupabaseClient>
}

export type RemoteSyncTable = Pick<SyncableTable, 'pushRow' | 'pullPage'>

export function createRemoteSyncTable({
  table,
  columns,
  loadClient,
}: RemoteSyncTableOptions): RemoteSyncTable {
  return {
    async pushRow(userId, row) {
      const supabase = await loadClient()
      await guardedUpsert(supabase, table, ['user_id', 'id'], { ...row, user_id: userId })
    },

    async pullPage(userId, since, limit) {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from(table)
        .select(`${columns}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as unknown as Array<SyncRow & { server_updated_at: string }>
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...rest }) => rest as SyncRow),
        cursor: rows.at(-1)?.server_updated_at ?? null,
      }
    },
  }
}
