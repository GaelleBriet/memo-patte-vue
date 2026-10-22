import type { Router } from 'vue-router'

import {
  keepsPendingCheckout,
  keepsPendingRestore,
} from '@/features/purchase/logic/pending-checkout'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'

export type PendingForget = { checkout: () => void; restore: () => void }

const FORGET_IN_STORE: PendingForget = {
  checkout: () => usePurchaseStore().forgetCheckout(),
  restore: () => usePurchaseStore().forgetRestore(),
}

/** Achat ou restauration demandés avant le compte ne reprennent que si l'on revient par leur parcours. */
export function installPendingCheckoutGuard(
  router: Router,
  forget: PendingForget = FORGET_IN_STORE,
): () => void {
  return router.afterEach((to, _from, failure) => {
    if (failure) return
    if (!keepsPendingCheckout(to.name)) forget.checkout()
    if (!keepsPendingRestore(to.name)) forget.restore()
  })
}
