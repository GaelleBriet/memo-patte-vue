import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { PlusStatus } from '../logic/plus-status'
import { nextAfterRestore, type RestoreOrigin } from '../logic/purchase-restore'
import { plusCheckout } from '../service/checkout.service'
import { showToast } from '@/shared/utils/toast'

/** « Restaurer mes achats » : la connexion d'abord, puis la restauration sur ce compte. */
export function usePurchaseRestore(from: RestoreOrigin, onRestored: (status: PlusStatus) => void) {
  const { t } = useI18n()
  const router = useRouter()
  const isRestoring = ref(false)

  async function restore(): Promise<void> {
    if (isRestoring.value) return
    isRestoring.value = true
    try {
      const next = nextAfterRestore(await plusCheckout.restorePurchases(), from)
      if (next.kind === 'detour') await router.push(next.route).catch(() => undefined)
      else if (next.kind === 'offline') showToast(t('auth.errors.offline'), { tone: 'error' })
      else onRestored(next.status)
    } catch {
      showToast(t('plus.restore.failed'), { tone: 'error' })
    } finally {
      isRestoring.value = false
    }
  }

  function resumeRestore(): void {
    if (plusCheckout.resumeRestore()) void restore()
  }

  return { isRestoring, restore, resumeRestore }
}
