import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { plusStatusLabel } from '../logic/plus-status-label'
import { usePurchaseStore } from '../store/purchase.store'
import { formatNumericDate } from '@/shared/utils/format'

/** « Plus annuel jusqu'au 14/09/2027 », « Plus mensuel — expiré »… ; `null` sans Plus, passé ou présent. */
export function usePlusStatusText(): ComputedRef<string | null> {
  const { t } = useI18n()
  const purchase = usePurchaseStore()
  return computed(() => {
    const label = plusStatusLabel(purchase.status, purchase.expiredPlan)
    if (label === null) return null
    return t(label.key, label.expiresAt ? { date: formatNumericDate(label.expiresAt) } : {})
  })
}
