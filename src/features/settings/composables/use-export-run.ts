import { computed, ref } from 'vue'

import type { DeliveryMode } from '../logic/export-delivery'
import { checkSaveAccess, requestSaveAccess, type SaveAccess } from '../logic/export-storage-access'
import { useAppResume } from '@/core/app-lifecycle/app-resume'

export type SaveAccessPort = {
  check: () => Promise<SaveAccess>
  request: () => Promise<SaveAccess>
}

export type ExportRunInterruption = 'no-access' | 'failed' | 'busy'

const storageAccess: SaveAccessPort = { check: checkSaveAccess, request: requestSaveAccess }

export function useExportRun(access: SaveAccessPort = storageAccess) {
  const pendingMode = ref<DeliveryMode | null>(null)
  const hasFailed = ref(false)
  const saveAccess = ref<SaveAccess>('unasked')
  let accessReads = 0

  async function refreshSaveAccess(): Promise<void> {
    const read = ++accessReads
    const state = await access.check()
    if (read === accessReads) saveAccess.value = state
  }

  // La demande d'Android fait passer l'app en arrière-plan : sa réponse prime sur une relecture.
  useAppResume(() => {
    if (pendingMode.value === null) void refreshSaveAccess()
  })

  async function run<T>(
    mode: DeliveryMode,
    deliver: () => Promise<T>,
  ): Promise<T | ExportRunInterruption> {
    if (pendingMode.value !== null) return 'busy'
    pendingMode.value = mode
    hasFailed.value = false
    try {
      if (mode === 'save') {
        accessReads += 1
        saveAccess.value = await access.request()
        if (saveAccess.value !== 'granted') return 'no-access'
      }
      return await deliver()
    } catch (cause) {
      console.warn('Export impossible :', cause)
      hasFailed.value = true
      return 'failed'
    } finally {
      pendingMode.value = null
    }
  }

  function reset(): void {
    hasFailed.value = false
    void refreshSaveAccess()
  }

  return {
    pendingMode,
    isPreparing: computed(() => pendingMode.value !== null),
    hasFailed,
    saveAccess,
    run,
    reset,
  }
}
