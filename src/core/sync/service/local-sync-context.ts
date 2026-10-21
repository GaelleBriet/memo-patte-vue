import { getDb } from '@/core/db/sqlite'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import { createSyncPushRepository } from '../repository/sync-push.repository'
import { createAccountRestore, type AccountRestore, type RestorableTable } from './account-restore'
import { createSyncCycle, type SyncCycle, type SyncCycleDependencies } from './sync-cycle'

export interface LocalSyncContext {
  outbox: ReturnType<typeof createSyncOutboxRepository>
  cycle: SyncCycle
  restore: AccountRestore
}

export type LocalSyncContextDependencies = Omit<
  SyncCycleDependencies,
  'db' | 'outbox' | 'pushes' | 'tables' | 'onRemindersOutdated'
> & {
  tables: RestorableTable[]
  onRemindersOutdated: () => Promise<void>
}

/**
 * Ouvre la base locale et compose la file d'attente, le cycle et la restauration : le seul point,
 * hors de `core/db`, autorisé à appeler `getDb()` (règle ESLint `app/repository-only-data-access`).
 */
export async function createLocalSyncContext(
  deps: LocalSyncContextDependencies,
): Promise<LocalSyncContext> {
  const db = await getDb()
  const outbox = createSyncOutboxRepository(db)
  const pushes = createSyncPushRepository(loadSupabaseClient)
  const cycle = createSyncCycle({ ...deps, db, outbox, pushes })
  const restore = createAccountRestore({
    db,
    outbox,
    tables: deps.tables,
    userId: deps.userId,
    onRemindersOutdated: deps.onRemindersOutdated,
  })
  return { outbox, cycle, restore }
}
