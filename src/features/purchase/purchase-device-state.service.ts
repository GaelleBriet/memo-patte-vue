import { clearPlusNudgeState } from './plus-nudge'
import { clearStoredPlusStatus } from './plus-status-storage'
import { usePurchaseStore } from './purchase.store'

/** Ce que l'appareil sait de l'abonnement d'un compte, rappels compris, mémoire du store comprise. */
export function clearPurchaseDeviceState(): void {
  usePurchaseStore().reset()
  clearStoredPlusStatus()
  clearPlusNudgeState()
}
