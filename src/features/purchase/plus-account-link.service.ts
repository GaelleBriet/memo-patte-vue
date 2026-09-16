import { watch, type WatchSource } from 'vue'

import { errorSummary } from '@/shared/error-summary'
import { usePurchaseStore } from './purchase.store'

export type PlusAccountPort = {
  available: boolean
  logIn(appUserID: string): Promise<unknown>
  logOut(): Promise<unknown>
}

export function createPlusAccountLink(purchase: () => PlusAccountPort) {
  async function attempt(
    warning: string,
    call: (port: PlusAccountPort) => Promise<unknown>,
  ): Promise<void> {
    const port = purchase()
    if (!port.available) return
    try {
      await call(port)
    } catch (cause) {
      console.warn(warning, errorSummary(cause))
    }
  }

  return {
    /** RevenueCat ne reçoit que l'identifiant du compte, jamais l'adresse e-mail. */
    linkToAccount: (userId: string) =>
      attempt('Achat non rattaché au compte :', (port) => port.logIn(userId)),

    unlinkFromAccount: () => attempt('Achat non détaché du compte :', (port) => port.logOut()),
  }
}

export type PlusAccountLink = ReturnType<typeof createPlusAccountLink>

export const plusAccountLink = createPlusAccountLink(() => usePurchaseStore())

/**
 * L'achat suit le compte : rattaché à la connexion, détaché à la déconnexion, repris par le compte
 * suivant sur le même appareil. Ni la connexion ni la déconnexion n'attendent le store.
 */
export function installPlusAccountLink(
  accountId: WatchSource<string | null>,
  link: PlusAccountLink = plusAccountLink,
): () => void {
  return watch(accountId, (userId, previous) => {
    if (userId !== null) void link.linkToAccount(userId)
    else if (previous !== null) void link.unlinkFromAccount()
  })
}
