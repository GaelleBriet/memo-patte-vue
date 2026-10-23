import type { SupabaseClient } from '@supabase/supabase-js'

import type { SyncPush } from '../service/syncable-table'

export const SYNC_PUSH_HEADER = 'x-memopatte-sync-push'

export function createSyncPushRepository(loadClient: () => Promise<SupabaseClient>) {
  return {
    async open(userId: string, sentAt: string): Promise<SyncPush> {
      const supabase = await loadClient()
      const push = { id: crypto.randomUUID(), sentAt }
      const { error } = await supabase
        .from('sync_push')
        .insert({ user_id: userId, id: push.id, sent_at: sentAt })
      if (error) throw error
      return push
    },
  }
}
