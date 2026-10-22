import type { PlusStatus } from '../logic/plus-status'
import { usePurchaseStore } from '../store/purchase.store'
import type { PaidPlan, PurchaseOutcome } from './billing.service'

export type CheckoutOutcome =
  PurchaseOutcome | { kind: 'needs-account' } | { kind: 'needs-sign-in' } | { kind: 'already-plus' }

export type CheckoutAccount = {
  accountId(): string | null
  hasSession(): boolean
  /** `true` quand la session est de nouveau active ; ne lève pas. */
  refreshSession(): Promise<boolean>
}

export type CheckoutPort = {
  status: PlusStatus
  logIn(appUserID: string): Promise<PlusStatus>
  purchase(plan: PaidPlan): Promise<PurchaseOutcome>
  rememberCheckout(plan: PaidPlan): void
  takePendingCheckout(): PaidPlan | null
}

export type ResumedCheckout = { plan: PaidPlan; pay: boolean }

export function createCheckout(account: CheckoutAccount, purchase: () => CheckoutPort) {
  return {
    /** Jamais d'achat sans compte ni session active, ni avant que l'achat soit rattaché au compte. */
    async checkout(plan: PaidPlan): Promise<CheckoutOutcome> {
      const port = purchase()
      const userId = account.accountId()
      if (userId === null) {
        port.rememberCheckout(plan)
        return { kind: 'needs-account' }
      }
      if (!account.hasSession() && !(await account.refreshSession())) {
        port.rememberCheckout(plan)
        return { kind: 'needs-sign-in' }
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
      const signedIn = account.accountId() !== null && account.hasSession()
      return { plan, pay: signedIn && port.status.plan === 'none' }
    },
  }
}

const NO_ACCOUNT: CheckoutAccount = {
  accountId: () => null,
  hasSession: () => false,
  refreshSession: async () => false,
}

let accountSource = NO_ACCOUNT

export function provideCheckoutAccount(source: CheckoutAccount): void {
  accountSource = source
}

export const plusCheckout = createCheckout(
  {
    accountId: () => accountSource.accountId(),
    hasSession: () => accountSource.hasSession(),
    refreshSession: () => accountSource.refreshSession(),
  },
  () => usePurchaseStore(),
)
