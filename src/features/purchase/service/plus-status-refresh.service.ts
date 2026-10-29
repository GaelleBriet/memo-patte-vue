import { watch } from 'vue'

import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { onNetworkOnline } from '@/core/sync/service/network-status'
import { usePurchaseStore } from '../store/purchase.store'

const AFTER_EXPIRY_MS = 60_000
/** Au-delà des 5 minutes du cache de RevenueCat au premier plan, pour lire un renouvellement tardif. */
const RETRY_AFTER_EXPIRY_MS = 10 * 60_000
const LONGEST_TIMEOUT_MS = 2_147_483_647

/**
 * Statut Plus revérifié au lancement, au retour au premier plan, au retour du réseau et juste après
 * l'échéance connue ; renvoie l'arrêt.
 */
export function installPlusStatusRefresh(): () => void {
  const purchase = usePurchaseStore()

  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const verify = () => void purchase.verifyKnownStatus()

  function waitForExpiry(expiresAt: string | null): void {
    clearTimeout(expiryTimer)
    clearTimeout(retryTimer)
    if (expiresAt === null) return
    const delay = Date.parse(expiresAt) + AFTER_EXPIRY_MS - Date.now()
    expiryTimer =
      delay > LONGEST_TIMEOUT_MS
        ? setTimeout(() => waitForExpiry(expiresAt), LONGEST_TIMEOUT_MS)
        : setTimeout(() => void verifyAfterExpiry(), Math.max(delay, 0))
  }

  async function verifyAfterExpiry(): Promise<void> {
    await purchase.verifyKnownStatus()
    if (purchase.expiredPlan !== null) retryTimer = setTimeout(verify, RETRY_AFTER_EXPIRY_MS)
  }

  verify()
  const stopExpiry = watch(
    () => purchase.status.expiresAt,
    (expiresAt) => {
      if (expiresAt === null) clearTimeout(expiryTimer)
      else waitForExpiry(expiresAt)
    },
    { immediate: true },
  )
  const stopResume = onAppResume(verify)
  const stopNetwork = onNetworkOnline(verify)
  return () => {
    stopExpiry()
    clearTimeout(expiryTimer)
    clearTimeout(retryTimer)
    stopResume()
    stopNetwork()
  }
}
