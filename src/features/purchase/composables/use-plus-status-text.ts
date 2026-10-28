import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { plusMemberLabel, plusStatusLabel, type PlusStatusLabel } from '../logic/plus-status-label'
import { usePurchaseStore } from '../store/purchase.store'
import { formatNumericDate } from '@/shared/utils/format'

function useLabelText(labelOf: () => PlusStatusLabel | null): ComputedRef<string | null> {
  const { t } = useI18n()
  return computed(() => {
    const label = labelOf()
    if (label === null) return null
    return t(label.key, label.expiresAt ? { date: formatNumericDate(label.expiresAt) } : {})
  })
}

/** « Plus annuel jusqu'au 14/09/2027 », « Plus mensuel — expiré »… ; `null` sans Plus, passé ou présent. */
export function usePlusStatusText(): ComputedRef<string | null> {
  const purchase = usePurchaseStore()
  return useLabelText(() =>
    plusStatusLabel(purchase.status, purchase.expiredPlan, {
      expiredOffered: purchase.expiredOffered,
    }),
  )
}

/** « Abonnement annuel actif. », « Plus offert, sans date de fin »… */
export function usePlusMemberText(): ComputedRef<string | null> {
  const purchase = usePurchaseStore()
  return useLabelText(() => plusMemberLabel(purchase.status))
}
