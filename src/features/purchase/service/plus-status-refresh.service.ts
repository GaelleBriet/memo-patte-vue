import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { usePurchaseStore } from '../store/purchase.store'

/** Statut Plus revérifié au lancement puis à chaque retour au premier plan ; renvoie l'arrêt. */
export function installPlusStatusRefresh(): () => void {
  const purchase = usePurchaseStore()
  void purchase.verifyKnownStatus()
  return onAppResume(() => void purchase.verifyKnownStatus())
}
