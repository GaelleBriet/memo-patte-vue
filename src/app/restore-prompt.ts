import { watch } from 'vue'
import type { Router } from 'vue-router'

import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { RESTORE_ROUTE, restoreRoute } from '@/shared/utils/restore-route'

/**
 * « Restaurer mon carnet » s'ouvre de lui-même une fois par lancement, au passage par l'accueil,
 * tant que la sauvegarde trouvée attend « Fusionner » ou « Remplacer ».
 */
export function installRestorePrompt(
  router: Router,
  flow: () => RestoreFlow | null = currentRestoreFlow,
): () => void {
  let prompted = false

  function promptIfOffered(): void {
    const step = flow()?.state.value.step
    if (step === undefined || step === 'idle') {
      prompted = false
      return
    }
    const current = router.currentRoute.value.name
    if (current === RESTORE_ROUTE) prompted = true
    if (prompted || step !== 'choice' || current !== 'home') return
    prompted = true
    void router.push(restoreRoute('home'))
  }

  const stopWatch = watch(() => flow()?.state.value.step, promptIfOffered)
  const stopAfterEach = router.afterEach(promptIfOffered)
  return () => {
    stopWatch()
    stopAfterEach()
  }
}
