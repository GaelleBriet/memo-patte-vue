import { computed, onScopeDispose, shallowRef } from 'vue'

import { currentBackupFacts, type BackupFacts } from '@/core/sync/service/backup-facts'
import { errorSummary } from '@/shared/utils/error-summary'
import { backupStatusOf, type BackupStatus } from '../logic/backup-status'

export const BACKUP_STATUS_REFRESH_MS = 2_000

/** L'état de la sauvegarde, relu tant que l'écran est ouvert ; `null` avant la première lecture. */
export function useBackupStatus() {
  const read = currentBackupFacts()
  const facts = shallowRef<BackupFacts | null>(null)
  const loaded = shallowRef(read === null)
  const now = shallowRef(new Date())
  let reading = false

  const status = computed<BackupStatus | null>(() =>
    loaded.value ? backupStatusOf(facts.value) : null,
  )

  async function refresh(): Promise<void> {
    if (read === null || reading) return
    reading = true
    try {
      facts.value = await read()
      loaded.value = true
    } catch (cause) {
      console.warn('État de la sauvegarde non lu :', errorSummary(cause))
    } finally {
      reading = false
      now.value = new Date()
    }
  }

  if (read !== null) {
    void refresh()
    const timer = setInterval(() => void refresh(), BACKUP_STATUS_REFRESH_MS)
    onScopeDispose(() => clearInterval(timer))
  }

  return { status, now }
}
