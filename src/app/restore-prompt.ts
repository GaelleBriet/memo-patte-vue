import { nextTick, watch } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'

import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import {
  createRestorePrompt,
  type RestorePromptNavigation,
  type RestorePromptScreen,
} from '@/core/sync/service/restore-prompt'
import { isAnySheetOpen } from '@/shared/composables/use-open-sheet'
import { REMINDER_QUERY_PARAM, REMINDER_STEP_QUERY_PARAM } from '@/shared/domain/reminder-route'
import { RESTORE_ROUTE, restoreRoute } from '@/shared/utils/restore-route'

export function installRestorePrompt(
  router: Router,
  flow: () => RestoreFlow | null = currentRestoreFlow,
): () => void {
  const prompt = createRestorePrompt()
  let installed = true

  function promptIfOffered(navigation: RestorePromptNavigation | null): void {
    const step = flow()?.state.value.step
    const screen = () => screenOf(router.currentRoute.value)
    if (prompt.shouldOpen(step, screen, navigation)) void router.push(restoreRoute('home'))
  }

  const stopWatch = watch(
    () => flow()?.state.value.step,
    () => promptIfOffered(null),
  )
  const stopAfterEach = router.afterEach((to, from, failure) => {
    const navigation = {
      arrived: !failure && isArrivalOnHome(to, from),
      leftRestore: !failure && from.name === RESTORE_ROUTE,
    }
    if (!navigation.arrived) return promptIfOffered(navigation)
    // L'écran quitté n'est démonté qu'au rendu suivant : ses feuilles compteraient encore ici.
    void nextTick(() => {
      if (installed) promptIfOffered(navigation)
    })
  })
  return () => {
    installed = false
    stopWatch()
    stopAfterEach()
  }
}

function screenOf(route: RouteLocationNormalized): RestorePromptScreen {
  return {
    onRestore: route.name === RESTORE_ROUTE,
    onHome: route.name === 'home',
    sheetShown: () => isAnySheetOpen.value || carriesSheet(route),
  }
}

function isArrivalOnHome(to: RouteLocationNormalized, from: RouteLocationNormalized): boolean {
  return to.name === 'home' && from.name !== 'home'
}

function carriesSheet(route: RouteLocationNormalized): boolean {
  return (
    route.query[REMINDER_QUERY_PARAM] !== undefined ||
    route.query[REMINDER_STEP_QUERY_PARAM] !== undefined
  )
}
