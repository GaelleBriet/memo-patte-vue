import type { PlusStatus } from '../logic/plus-status'
import { usePurchaseStore } from '../store/purchase.store'
import type { PaidPlan, PurchaseOutcome } from './billing.service'

export type CheckoutOutcome = PurchaseOutcome | { kind: 'needs-account' } | { kind: 'already-plus' }

export type CheckoutPort = {
  status: PlusStatus
  logIn(appUserID: string): Promise<PlusStatus>
  purchase(plan: PaidPlan): Promise<PurchaseOutcome>
  rememberCheckout(plan: PaidPlan): void
  takePendingCheckout(): PaidPlan | null
}

export type ResumedCheckout = { plan: PaidPlan; pay: boolean }

export function createCheckout(accountId: () => string | null, purchase: () => CheckoutPort) {
  return {
    /** Jamais d'achat sans compte, ni avant que l'achat soit rattaché au compte. */
    async checkout(plan: PaidPlan): Promise<CheckoutOutcome> {
      const port = purchase()
      const userId = accountId()
      if (userId === null) {
        port.rememberCheckout(plan)
        return { kind: 'needs-account' }
      }
      const status = await port.logIn(userId)
      if (status.plan !== 'none') return { kind: 'already-plus' }
      return port.purchase(plan)
    },

    /** Reprend l'offre choisie avant le passage par le compte ; `pay` : le paiement repart. */
    resume(): ResumedCheckout | null {
      const port = purchase()
      const plan = port.takePendingCheckout()
      if (plan === null) return null
      return { plan, pay: accountId() !== null && port.status.plan === 'none' }
    },
  }
}

let accountSource: () => string | null = () => null

export function provideCheckoutAccount(source: () => string | null): void {
  accountSource = source
}

export const plusCheckout = createCheckout(
  () => accountSource(),
  () => usePurchaseStore(),
)
