import type { usePurchaseStore } from '@/features/purchase/store/purchase.store'

type PurchaseState = ReturnType<typeof usePurchaseStore>

export type AccountFirstOffer = PurchaseState['offers'][number]

export function accountFirstOffer(
  plan: PurchaseState['pendingCheckout'],
  offers: readonly AccountFirstOffer[],
): AccountFirstOffer | null {
  return offers.find((offer) => offer.plan === plan) ?? null
}

export function leavesAccountFirst(hasAccount: boolean, offer: AccountFirstOffer | null): boolean {
  return hasAccount || offer === null
}
