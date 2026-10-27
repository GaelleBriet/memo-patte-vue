import { watch, type Ref } from 'vue'

import type { RestoreFlowState } from './restore-flow'
import { SYNC_BACKOFF_STEPS_MS } from './sync-scheduler'

const RETRY_STEPS = new Set<RestoreFlowState['step']>(['waiting-network', 'restoring', 'checking'])

export interface RestoreRetryOptions {
  state: Readonly<Ref<RestoreFlowState>>
  retry: () => void
}

/**
 * Tant que « Restaurer mon carnet » attend le réseau, un nouvel essai à chaque palier de recul :
 * le réseau peut revenir sans jamais avoir été coupé aux yeux d'Android. Aucun essai tant que la
 * session a expiré, un essai tout de suite à la reconnexion. Renvoie l'arrêt.
 */
export function installRestoreRetry({ state, retry }: RestoreRetryOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempts = 0

  function clear(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function schedule(): void {
    clear()
    const delay = SYNC_BACKOFF_STEPS_MS[Math.min(attempts, SYNC_BACKOFF_STEPS_MS.length - 1)]!
    timer = setTimeout(() => {
      attempts += 1
      schedule()
      retry()
    }, delay)
  }

  const stopWatch = watch(
    () => state.value.step,
    (step, previous) => {
      if (step === 'waiting-network') {
        if (timer === null) schedule()
        if (previous === 'waiting-sign-in') retry()
        return
      }
      clear()
      if (!RETRY_STEPS.has(step)) attempts = 0
    },
    { flush: 'sync', immediate: true },
  )

  return () => {
    stopWatch()
    clear()
  }
}
