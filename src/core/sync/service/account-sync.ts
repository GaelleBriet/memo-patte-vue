import { watch } from 'vue'

import { onAppResume } from '@/core/app-lifecycle/app-resume'
import type { RestoreMode } from '@/core/sync/service/account-restore'
import type { BackupSummary } from '@/core/sync/service/backup-summary'
import type { LocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import { onNetworkOnline } from '@/core/sync/service/network-status'
import type { RestoreFlow } from '@/core/sync/service/restore-flow'
import { installRestoreRetry } from '@/core/sync/service/restore-retry'
import type { SyncCycleOutbox } from '@/core/sync/service/sync-cycle'
import { createSyncScheduler, resumePendingSync } from '@/core/sync/service/sync-scheduler'
import { errorSummary, localErrorMessage } from '@/shared/utils/error-summary'

export type AccountBackupCheck =
  | { kind: 'signed-out' }
  | { kind: 'active' }
  | { kind: 'seeded' }
  | { kind: 'unreachable' }
  | { kind: 'restore-pending'; mode: RestoreMode }
  | { kind: 'backup-found'; summary: BackupSummary }

const CHECK_TIMEOUT_MS = 30_000

export interface SyncDependencies {
  outbox: SyncCycleOutbox & Pick<LocalSyncOutbox, 'forgetAccount'>
  runCycle: () => Promise<void>
  userId: () => string | null
  sessionActive: () => boolean
  checkAccountBackup: () => Promise<AccountBackupCheck>
  restoreFlow: Pick<
    RestoreFlow,
    | 'state'
    | 'checking'
    | 'noAnswer'
    | 'onRetryCheck'
    | 'offer'
    | 'unreachable'
    | 'reset'
    | 'resume'
    | 'onRestored'
  >
  /** Ne lève pas : une photo qui manque encore se retente au lancement suivant. */
  restoreMissingPhotos: (userId: string, options?: { visible?: boolean }) => Promise<void>
}

/**
 * Branche la synchro sur le lancement, le premier plan, le réseau et le changement de compte, et le
 * contrôle de la sauvegarde une fois par compte et par lancement ; renvoie le débranchement. Le
 * debounce après écriture vient des triggers SQLite, pas d'ici.
 */
export async function installSync(deps: SyncDependencies): Promise<() => void> {
  const scheduler = createSyncScheduler({ runCycle: deps.runCycle })
  let accountWork: Promise<void> = Promise.resolve()
  let checkedFor: string | null = null

  const enqueue = (task: () => Promise<void>) => {
    accountWork = accountWork.then(task)
  }

  function restorePhotos(options?: { visible: true }): void {
    const userId = deps.userId()
    if (!deps.sessionActive() || userId === null) return
    if (options) void deps.restoreMissingPhotos(userId, options)
    else void deps.restoreMissingPhotos(userId)
  }

  async function runRestore(): Promise<void> {
    await deps.restoreFlow.resume()
  }

  async function checkBackup(): Promise<void> {
    const checkedUserId = deps.userId()
    try {
      const outcome = await answeredInTime(deps.checkAccountBackup())
      if (deps.userId() !== checkedUserId) return
      if (outcome === null) deps.restoreFlow.noAnswer()
      else if (outcome.kind === 'backup-found') deps.restoreFlow.offer(outcome.summary)
      else if (outcome.kind === 'restore-pending') await runRestore()
      else if (outcome.kind === 'active') restorePhotos()
      else if (outcome.kind === 'unreachable') {
        checkedFor = null
        deps.restoreFlow.unreachable()
      } else {
        deps.restoreFlow.reset()
        if (outcome.kind === 'seeded') scheduler.notifyChange()
      }
    } catch (cause) {
      if (deps.userId() !== checkedUserId) return
      checkedFor = null
      deps.restoreFlow.unreachable()
      console.warn(
        'Sauvegarde du compte non contrôlée :',
        errorSummary(cause),
        localErrorMessage(cause),
      )
    }
  }

  function checkOnce(): void {
    const userId = deps.userId()
    if (!deps.sessionActive() || userId === null || checkedFor === userId) return
    checkedFor = userId
    deps.restoreFlow.checking()
    enqueue(checkBackup)
  }

  function onComeback(): void {
    enqueue(runRestore)
    checkOnce()
    scheduler.notifyChange()
  }

  const stopRestored = deps.restoreFlow.onRestored(() => {
    scheduler.notifyChange()
    restorePhotos({ visible: true })
  })
  const stopRetry = deps.restoreFlow.onRetryCheck(() => {
    checkedFor = null
    checkOnce()
  })
  const stopRestoreRetry = installRestoreRetry({
    state: deps.restoreFlow.state,
    retry: () => {
      enqueue(runRestore)
      checkOnce()
    },
  })
  const stopResume = onAppResume(onComeback)
  const stopNetwork = onNetworkOnline(onComeback)
  const stopAccountWatch = watch(
    () => ({ userId: deps.userId(), active: deps.sessionActive() }),
    ({ userId, active }, before) => {
      const previous = before ? before.userId : userId
      if (userId !== previous) {
        checkedFor = null
        deps.restoreFlow.reset()
        if (previous !== null) {
          const forgotten = forgetPreviousAccount(deps.outbox)
          enqueue(() => forgotten)
        } else scheduler.notifyChange()
      }
      if (active) checkOnce()
    },
    { flush: 'sync', immediate: true },
  )

  await resumePendingSync(deps.outbox, scheduler)
  scheduler.notifyChange()

  return () => {
    stopRestored()
    stopRetry()
    stopRestoreRetry()
    stopResume()
    stopNetwork()
    stopAccountWatch()
  }
}

/** `null` si le serveur n'a pas répondu à temps ; le contrôle revient alors au lancement suivant. */
async function answeredInTime<T>(answer: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const silence = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CHECK_TIMEOUT_MS)
  })
  try {
    return await Promise.race([answer, silence])
  } finally {
    clearTimeout(timer)
  }
}

async function forgetPreviousAccount(outbox: SyncDependencies['outbox']): Promise<void> {
  try {
    await outbox.forgetAccount()
  } catch (cause) {
    console.warn('File de synchro non oubliée au départ du compte :', errorSummary(cause))
  }
}
