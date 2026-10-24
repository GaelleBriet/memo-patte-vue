import { computed, onScopeDispose, shallowRef } from 'vue'

import { onAppPause } from '@/core/app-lifecycle/app-pause'
import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { currentBackupFacts, type BackupFacts } from '@/core/sync/service/backup-facts'
import { onNetworkOnline } from '@/core/sync/service/network-status'
import { errorSummary } from '@/shared/utils/error-summary'
import { backupStatusOf, refusedItemsOf, type BackupStatus } from '../logic/backup-status'

export const BACKUP_STATUS_REFRESH_MS = 2_000

type Reading = 'pending' | 'read' | 'unread' | 'unplugged'

/**
 * L'état de la sauvegarde : relu toutes les 2 s pendant la première sauvegarde ou tant que la synchro
 * n'est pas branchée, sinon au retour au premier plan et du réseau ; `null` avant la première lecture.
 */
export function useBackupStatus() {
  const facts = shallowRef<BackupFacts | null>(null)
  const reading = shallowRef<Reading>('pending')
  const now = shallowRef(new Date())
  let timer: ReturnType<typeof setTimeout> | null = null
  let busy = false
  let stopped = false
  let foreground = document.visibilityState !== 'hidden'

  const status = computed<BackupStatus | null>(() => {
    if (reading.value === 'pending') return null
    if (reading.value === 'unread') return { kind: 'unread' }
    return backupStatusOf(facts.value)
  })
  const refused = computed(() => refusedItemsOf(facts.value))

  function cancelNext(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function scheduleNext(): void {
    cancelNext()
    if (stopped || !foreground) return
    if (reading.value === 'unplugged' || status.value?.kind === 'first-backup') {
      timer = setTimeout(() => void refresh(), BACKUP_STATUS_REFRESH_MS)
    }
  }

  async function refresh(): Promise<void> {
    if (busy || stopped) return
    const read = currentBackupFacts()
    if (read === null) {
      if (reading.value === 'pending') reading.value = 'unplugged'
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
      now.value = new Date()
      scheduleNext()
    }
  }

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

  return { status, refused, now }
}
