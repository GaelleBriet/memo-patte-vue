import { clearPurchaseDeviceState } from '@/features/purchase/service/purchase-device-state.service'
import { clearAccountUsageSignals, clearUsageSignals } from '@/shared/utils/usage-signals'

/**
 * Déconnexion : seuls les compteurs d'usage suivent le compte. L'achat Google Play appartient
 * à l'appareil, et « Ne plus me proposer Plus » est une préférence, pas de l'état de compte.
 */
export function clearSignedOutAccountState(): void {
  clearAccountUsageSignals()
}

/** Changement de compte : le compte suivant n'hérite de rien. */
export function clearDeviceAccountState(): void {
  clearPurchaseDeviceState()
  clearUsageSignals()
}
