import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import { createPhotoPush, type PhotoPushDependencies } from './photo-push'
import { createPhotoRemoval, type PhotoRemovalDependencies } from './photo-removal'
import { createPullCycle } from './pull-cycle'
import { createPushCycle, type KeptRow, type PushOutcome } from './push-cycle'
import type { SyncPush, SyncableTable } from './syncable-table'

const REMINDER_ENTITIES = new Set([
  'animal',
  'vaccination',
  'vaccination_injection',
  'treatment',
  'treatment_period',
  'treatment_dose',
  'carnet_settings',
])

export interface SyncCycleOutbox {
  listPending(): Promise<SyncOutboxEntry[]>
  removeIfUnchanged(entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>): Promise<void>
  markRefusedIfUnchanged(
    entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>,
    refusedAt: string,
  ): Promise<void>
  markRefusedWithRefusedAncestor(
    entry: Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>,
    refusedAt: string,
  ): Promise<boolean>
  getLastPulledAt(entity: string): Promise<string | null>
  setLastPulledAt(entity: string, lastPulledAt: string): Promise<void>
  isEnabled(): Promise<boolean>
  unqueuedStatements(statements: SqlStatement[], enabledAfter: boolean): SqlStatement[]
  setLastSyncedAt(lastSyncedAt: string): Promise<void>
  recordFailedPush(entry: Pick<SyncOutboxEntry, 'entity' | 'entityId'>): Promise<void>
}

interface SyncCyclePushes {
  open(userId: string, sentAt: string): Promise<SyncPush>
}

export interface SyncCycleDependencies {
  db: DbClient
  outbox: SyncCycleOutbox
  pushes: SyncCyclePushes
  /** Dans l'ordre de `SYNC_ENTITY_ORDER` : un parent est tiré avant ses enfants. */
  tables: SyncableTable[]
  userId: () => string | null
  isEligible: () => boolean
  /** Reconstruit les rappels : injecté plutôt qu'importé, `core/sync` reste indépendant des features. */
  onRemindersOutdated?: () => Promise<void>
  /** L'horloge du téléphone ; `new Date()` par défaut. */
  now?: () => Date
  /** Sans elles, les photos restent en file. */
  photos?: PhotoPushDependencies & PhotoRemovalDependencies
}

export interface SyncCycle {
  runCycle(): Promise<void>
}

export function createSyncCycle(deps: SyncCycleDependencies): SyncCycle {
  const now = deps.now ?? (() => new Date())
  const pushCycle = createPushCycle(deps, now)
  const pullCycle = createPullCycle(deps)
  const photoPush = deps.photos && createPhotoPush(deps.outbox, deps.photos, now)
  const photoRemoval = deps.photos && createPhotoRemoval(deps.outbox, deps.photos, now)

  return {
    /** Une ligne passée derrière son curseur ne revient plus : ses rappels se reconstruisent même si la suite échoue. */
    async runCycle(): Promise<void> {
      if (!deps.isEligible()) return
      const userId = deps.userId()
      if (!userId) return
      if (!(await deps.outbox.isEnabled())) return

      let touchedReminders = false
      const onRemindersTouched = (entity: string) => {
        if (REMINDER_ENTITIES.has(entity)) touchedReminders = true
      }
      let keptRows: KeptRow[] = []
      let pushFailure: PushOutcome['failure'] = null
      try {
        const pushed = await pushCycle.push(userId)
        keptRows = pushed.keptRows
        pushFailure = pushed.failure
        const photoFailure = photoPush ? await photoPush.push(userId) : null
        pushFailure ??= photoFailure
        await pullCycle.pull(userId, keptRows, onRemindersTouched)
      } finally {
        await pullCycle.keepServerRows(keptRows, onRemindersTouched)
        if (touchedReminders) await deps.onRemindersOutdated?.()
      }
      const removalFailure = photoRemoval ? await photoRemoval.remove(userId) : null
      pushFailure ??= removalFailure
      if (pushFailure) throw pushFailure.cause
      await deps.outbox.setLastSyncedAt(now().toISOString())
    },
  }
}
