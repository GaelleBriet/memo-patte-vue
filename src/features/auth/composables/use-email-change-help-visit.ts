import { useRouter } from 'vue-router'

import { clearHeldEmailChange } from '../logic/held-email-change'
import { helpRoute, isHelpRoute } from '@/shared/utils/sign-in-route'

const EMAIL_CHANGE_ROUTE = 'settings-account-email'

/** Garde l'écran en mémoire pendant la visite de l'aide ; toute autre sortie de l'aide l'efface. */
export function useEmailChangeHelpVisit(hold: () => void): { openHelp(): void } {
  const router = useRouter()

  function openHelp(): void {
    hold()
    const stop = router.afterEach((to, _from, failure) => {
      if (failure) clearHeldEmailChange()
      else if (isHelpRoute(to.name)) return
      else if (to.name !== EMAIL_CHANGE_ROUTE) clearHeldEmailChange()
      stop()
    })
    void router.push(helpRoute(EMAIL_CHANGE_ROUTE))
  }

  return { openHelp }
}
