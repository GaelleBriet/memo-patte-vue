import { watch } from 'vue'
import type { Router } from 'vue-router'

import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { RESTORE_ROUTE, restoreRoute } from '@/shared/utils/restore-route'

/**
 * « Restaurer mon carnet » s'ouvre de lui-même une fois par lancement, au passage par l'accueil,
 * tant que la sauvegarde trouvée attend « Fusionner » ou « Remplacer ». Un choix reproposé après
 * une restauration lancée (carnet du téléphone changé depuis « Remplacer ») l'ouvre de nouveau.
 */
export function installRestorePrompt(
  router: Router,
  flow: () => RestoreFlow | null = currentRestoreFlow,
): () => void {
  let prompted = false
  let choiceRan = false

  function promptIfOffered(): void {
    const step = flow()?.state.value.step
    if (step === undefined || step === 'idle') {
      prompted = false
      choiceRan = false
      return
    }
    if (step === 'restoring') {
      prompted = false
      choiceRan = true
      return
    }
    const current = router.currentRoute.value.name
    if (current === RESTORE_ROUTE && (!choiceRan || step === 'choice')) prompted = true
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
