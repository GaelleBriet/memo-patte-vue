import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { onNetworkOnline } from '@/core/sync/service/network-status'
import { usePurchaseStore } from '../store/purchase.store'

/** Statut Plus revérifié au lancement, au retour au premier plan et au retour du réseau ; renvoie l'arrêt. */
export function installPlusStatusRefresh(): () => void {
  const purchase = usePurchaseStore()
  const verify = () => void purchase.verifyKnownStatus()
  verify()
  const stopResume = onAppResume(verify)
  const stopNetwork = onNetworkOnline(verify)
  return () => {
    stopResume()
    stopNetwork()
  }
}
