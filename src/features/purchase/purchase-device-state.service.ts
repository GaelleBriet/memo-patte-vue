import { clearPlusNudgeState } from './plus-nudge'
import { clearStoredPlusStatus } from './plus-status-storage'

/** Ce que l'appareil sait de l'abonnement d'un compte, rappels compris. */
export function clearPurchaseDeviceState(): void {
  clearStoredPlusStatus()
  clearPlusNudgeState()
}
