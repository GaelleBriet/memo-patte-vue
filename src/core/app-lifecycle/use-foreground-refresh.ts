import { format } from 'date-fns'
import { onScopeDispose, readonly, ref, type Ref } from 'vue'

import { onAppResume } from './app-resume'

function currentIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Date civile du jour (`yyyy-MM-dd`), recalculée à chaque retour au premier plan,
 * où `reload` est aussi appelé. L'abonnement suit la vie du composant appelant.
 */
export function useForegroundRefresh(reload: () => void): { today: Readonly<Ref<string>> } {
  const today = ref(currentIsoDate())

  const stop = onAppResume(() => {
    today.value = currentIsoDate()
    reload()
  })
  onScopeDispose(stop)

  return { today: readonly(today) }
}
