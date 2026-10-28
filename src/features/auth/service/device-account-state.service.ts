import { clearPurchaseDeviceState } from '@/features/purchase/service/purchase-device-state.service'
import { clearAccountUsageSignals, clearUsageSignals } from '@/core/usage/usage-signals'

import { clearHeldEmailChange } from '../logic/held-email-change'
import { clearPlusAccount, readPlusAccount } from '../logic/plus-account-storage'
import { authRepository } from '../repository/auth.repository'

/**
 * Déconnexion : seuls les compteurs d'usage suivent le compte. L'achat Google Play appartient
 * à l'appareil, et « Ne plus me proposer Plus » est une préférence, pas de l'état de compte.
 */
export function clearSignedOutAccountState(): void {
  clearHeldEmailChange()
  clearAccountUsageSignals()
}

/** Compte supprimé : l'appareil oublie aussi l'achat, ce que le carnet a vécu reste. */
export function clearDeletedAccountState(): void {
  clearHeldEmailChange()
  clearPurchaseDeviceState()
  clearAccountUsageSignals()
}

/** Changement de compte : le compte suivant n'hérite de rien. */
export function clearDeviceAccountState(): void {
  clearHeldEmailChange()
  clearPurchaseDeviceState()
  clearUsageSignals()
}

export function isSignedInOnDevice(): boolean {
  return readPlusAccount() !== null
}

/** Hors du store : l'app redémarre juste après, sans repasser par l'écran. Ne lève pas. */
export async function signOutDevice(): Promise<void> {
  await authRepository.signOut()
  clearPlusAccount()
}

export function forgetDeviceSession(): Promise<void> {
  return authRepository.forgetSession()
}
