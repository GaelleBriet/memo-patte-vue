import { watch } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { REMINDER_QUERY_PARAM, REMINDER_STEP_QUERY_PARAM } from '@/shared/domain/reminder-route'
import { RESTORE_ROUTE, restoreRoute } from '@/shared/utils/restore-route'

/**
 * « Restaurer mon carnet » s'ouvre de lui-même une fois par jour local, au passage par l'accueil,
 * tant que la sauvegarde trouvée attend « Fusionner » ou « Remplacer ». Un choix reproposé après
 * une restauration lancée (carnet du téléphone changé depuis « Remplacer ») l'ouvre de nouveau.
 * Hors de la toute première proposition, seule une arrivée sur l'accueil l'ouvre, sans feuille à
 * rouvrir dans l'adresse : une feuille ouverte sur l'accueil n'a pas de route.
 */
export function installRestorePrompt(
  router: Router,
  flow: () => RestoreFlow | null = currentRestoreFlow,
): () => void {
  let shownOn: string | null = null
  let choiceRan = false

  function promptIfOffered(arrived: boolean, leftRestore: boolean): void {
    const step = flow()?.state.value.step
    if (step === undefined || step === 'idle') {
      shownOn = null
      choiceRan = false
      return
    }
    if (step === 'restoring') {
      shownOn = null
      choiceRan = true
      return
    }
    const today = todayIsoDate()
    const current = router.currentRoute.value.name
    const onRestore = current === RESTORE_ROUTE || leftRestore
    if (onRestore && (!choiceRan || step === 'choice')) shownOn = today
    if (shownOn === today || step !== 'choice' || current !== 'home') return
    if ((choiceRan || shownOn !== null) && !arrived) return
    shownOn = today
    void router.push(restoreRoute('home'))
  }

  const stopWatch = watch(
    () => flow()?.state.value.step,
    () => promptIfOffered(false, false),
  )
  const stopAfterEach = router.afterEach((to, from, failure) =>
    promptIfOffered(!failure && isArrivalOnHome(to, from), !failure && from.name === RESTORE_ROUTE),
  )
  return () => {
    stopWatch()
    stopAfterEach()
  }
}

function isArrivalOnHome(to: RouteLocationNormalized, from: RouteLocationNormalized): boolean {
  return (
    to.name === 'home' &&
    from.name !== 'home' &&
    to.query[REMINDER_QUERY_PARAM] === undefined &&
    to.query[REMINDER_STEP_QUERY_PARAM] === undefined
  )
}
