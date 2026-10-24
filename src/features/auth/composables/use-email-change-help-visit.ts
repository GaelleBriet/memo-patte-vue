import { isNavigationFailure, NavigationFailureType, useRouter } from 'vue-router'

import { clearHeldEmailChange } from '../logic/held-email-change'
import { helpRoute, isHelpRoute } from '@/shared/utils/sign-in-route'

const EMAIL_CHANGE_ROUTE = 'settings-account-email'

let stopWatching: (() => void) | null = null

/** Garde l'écran en mémoire pendant la visite de l'aide ; toute autre sortie de l'aide l'efface. */
export function useEmailChangeHelpVisit(hold: () => void): { openHelp(): void } {
  const router = useRouter()

  function endVisit(): void {
    stopWatching?.()
    stopWatching = null
  }

  function openHelp(): void {
    hold()
    endVisit()
    stopWatching = router.afterEach((to, _from, failure) => {
      if (isHelpRoute(to.name)) {
        if (!failure || isNavigationFailure(failure, NavigationFailureType.cancelled)) return
        clearHeldEmailChange()
      } else if (failure || to.name !== EMAIL_CHANGE_ROUTE) {
        clearHeldEmailChange()
      }
      endVisit()
    })
    void router.push(helpRoute(EMAIL_CHANGE_ROUTE))
  }

  return { openHelp }
}
