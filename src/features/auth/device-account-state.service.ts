import { clearPlusNudgeState } from '@/features/purchase/plus-nudge'
import { clearStoredPlusStatus } from '@/features/purchase/plus-status-storage'
import { clearUsageSignals } from '@/shared/usage-signals'

/** Quand le compte quitte l'appareil, ce que le compte suivant hériterait part avec lui. */
export function clearDeviceAccountState(): void {
  clearStoredPlusStatus()
  clearPlusNudgeState()
  clearUsageSignals()
}
