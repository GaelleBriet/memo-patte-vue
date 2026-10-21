import type { SupabaseClient } from '@supabase/supabase-js'

import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import type { SyncableTable } from '@/core/sync/service/syncable-table'
import { SYNC_PUSH_HEADER } from './sync-push.repository'

export interface RemoteSyncTableOptions {
  table: string
  columns: string
  loadClient: () => Promise<SupabaseClient>
}

export type RemoteSyncTable = Pick<SyncableTable, 'pushRow' | 'pullPage'>

type StampedRow = SyncRow & { server_updated_at: string }

interface PullQuery {
  order(column: string, options: { ascending: boolean }): PullQuery
  limit(count: number): PromiseLike<{ data: unknown; error: unknown }>
}

async function page(query: PullQuery, limit: number): Promise<StampedRow[]> {
  const { data, error } = await query
    .order('server_updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as StampedRow[]
}

export function createRemoteSyncTable({
  table,
  columns,
  loadClient,
}: RemoteSyncTableOptions): RemoteSyncTable {
  return {
    async pushRow(userId, row, push) {
      const supabase = await loadClient()
      return guardedUpsert(
        supabase,
        table,
        ['user_id', 'id'],
        { ...row, user_id: userId },
        { columns, headers: push ? { [SYNC_PUSH_HEADER]: push.id } : {} },
      )
    },

    async pullPage(userId, since, limit, afterId) {
      const supabase = await loadClient()
      const read = () =>
        supabase.from(table).select(`${columns}, server_updated_at`).eq('user_id', userId)

      const rows: StampedRow[] = []
      if (afterId === undefined) {
        rows.push(...(await page(read().gte('server_updated_at', since), limit)))
      } else {
        rows.push(...(await page(read().eq('server_updated_at', since).gt('id', afterId), limit)))
        if (rows.length < limit) {
          rows.push(...(await page(read().gt('server_updated_at', since), limit - rows.length)))
        }
      }

      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...rest }) => rest as SyncRow),
        stamps: rows.map(({ server_updated_at }) => server_updated_at),
        cursor: rows.at(-1)?.server_updated_at ?? null,
      }
    },
  }
}
