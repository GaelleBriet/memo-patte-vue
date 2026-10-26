import { computed, onScopeDispose, readonly, shallowRef, watch } from 'vue'

import { onAppPause } from '@/core/app-lifecycle/app-pause'
import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { currentBackupFacts, type BackupFacts } from '@/core/sync/service/backup-facts'
import { onNetworkOnline } from '@/core/sync/service/network-status'
import { currentRestoreFlow } from '@/core/sync/service/restore-flow'
import { errorSummary } from '@/shared/utils/error-summary'
import {
  backupStatusOf,
  photosBackedUpOf,
  refusedItemsOf,
  type BackupStatus,
} from '../logic/backup-status'

export const BACKUP_STATUS_REFRESH_MS = 2_000

type Reading = 'pending' | 'read' | 'unread' | 'unplugged'

/**
 * L'état de la sauvegarde : relu toutes les 2 s pendant la première sauvegarde ou tant que la synchro
 * n'est pas branchée, sinon au retour au premier plan et du réseau, et à la fin d'une restauration ;
 * `polling: false` : jamais toutes les 2 s. `null` avant la première lecture. `awaitsRestoredStatus` :
 * la restauration est finie, l'état qui la suit n'est pas encore lu.
 */
export function useBackupStatus({ polling = true } = {}) {
  const facts = shallowRef<BackupFacts | null>(null)
  const reading = shallowRef<Reading>('pending')
  const now = shallowRef(new Date())
  const awaitsRestoredStatus = shallowRef(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let busy = false
  let readAgain = false
  let stopped = false
  let foreground = document.visibilityState !== 'hidden'

  const status = computed<BackupStatus | null>(() => {
    if (reading.value === 'pending') return null
    if (reading.value === 'unread') return { kind: 'unread' }
    return backupStatusOf(facts.value)
  })
  const refused = computed(() => refusedItemsOf(facts.value))
  const photosBackedUp = computed(() => photosBackedUpOf(facts.value))

  function cancelNext(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function scheduleNext(): void {
    cancelNext()
    if (stopped || !foreground || !polling) return
    if (reading.value === 'unplugged' || status.value?.kind === 'first-backup') {
      timer = setTimeout(() => void refresh(), BACKUP_STATUS_REFRESH_MS)
    }
  }

  async function refresh(): Promise<void> {
    if (stopped) return
    if (busy) {
      readAgain = true
      return
    }
    const settles = awaitsRestoredStatus.value
    const read = currentBackupFacts()
    if (read === null) {
      if (reading.value === 'pending') reading.value = 'unplugged'
      if (settles) awaitsRestoredStatus.value = false
      scheduleNext()
      return
    }
    busy = true
    try {
      facts.value = await read()
      reading.value = 'read'
    } catch (cause) {
      console.warn('État de la sauvegarde non lu :', errorSummary(cause))
      if (reading.value !== 'read') reading.value = 'unread'
    } finally {
      busy = false
      if (settles) awaitsRestoredStatus.value = false
      now.value = new Date()
      if (readAgain) {
        readAgain = false
        void refresh()
      } else scheduleNext()
    }
  }

  watch(
    () => currentRestoreFlow()?.state.value.step,
    (step) => {
      if (step !== 'done') return
      awaitsRestoredStatus.value = true
      void refresh()
    },
  )

  void refresh()
  const stopResume = onAppResume(() => {
    foreground = true
    void refresh()
  })
  const stopPause = onAppPause(() => {
    foreground = false
    cancelNext()
  })
  const stopNetwork = onNetworkOnline(() => void refresh())
  onScopeDispose(() => {
    stopped = true
    cancelNext()
    stopResume()
    stopPause()
    stopNetwork()
  })

  return {
    status,
    refused,
    photosBackedUp,
    now,
    awaitsRestoredStatus: readonly(awaitsRestoredStatus),
  }
}
