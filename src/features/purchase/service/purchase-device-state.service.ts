import { clearPlusNudgeState } from '../logic/plus-nudge'
import { clearStoredPlusStatus } from '../logic/plus-status-storage'
import { usePurchaseStore } from '../store/purchase.store'

/** Ce que l'appareil sait de l'abonnement d'un compte, rappels compris, mémoire du store comprise. */
export function clearPurchaseDeviceState(): void {
  usePurchaseStore().reset()
  clearStoredPlusStatus()
  clearPlusNudgeState()
}
