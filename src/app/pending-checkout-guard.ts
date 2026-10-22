import type { Router } from 'vue-router'

import { keepsPendingCheckout } from '@/features/purchase/logic/pending-checkout'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'

/** L'offre choisie avant le compte ne reprend que si l'on revient à l'écran Plus par son parcours. */
export function installPendingCheckoutGuard(
  router: Router,
  forget: () => void = () => usePurchaseStore().forgetCheckout(),
): () => void {
  return router.afterEach((to, _from, failure) => {
    if (!failure && !keepsPendingCheckout(to.name)) forget()
  })
}
