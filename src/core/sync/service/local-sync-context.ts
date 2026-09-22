import { getDb } from '@/core/db/sqlite'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import { createSyncCycle, type SyncCycle, type SyncCycleDependencies } from './sync-cycle'

export interface LocalSyncContext {
  outbox: ReturnType<typeof createSyncOutboxRepository>
  cycle: SyncCycle
}

export type LocalSyncContextDependencies = Omit<SyncCycleDependencies, 'db' | 'outbox'>

/**
 * Ouvre la base locale et compose la file d'attente et le cycle : le seul point, hors de
 * `core/db`, autorisé à appeler `getDb()` (règle ESLint `app/repository-only-data-access`).
 */
export async function createLocalSyncContext(
  deps: LocalSyncContextDependencies,
): Promise<LocalSyncContext> {
  const db = await getDb()
  const outbox = createSyncOutboxRepository(db)
  const cycle = createSyncCycle({ ...deps, db, outbox })
  return { outbox, cycle }
}
