import type { Ref } from 'vue'

import { useAppResume } from './app-resume'
import { useToday } from './use-today'

/**
 * Date civile du jour (`yyyy-MM-dd`), recalculée à chaque retour au premier plan,
 * où `reload` est aussi appelé. L'abonnement suit la vie du composant appelant.
 */
export function useForegroundRefresh(reload: () => void): { today: Readonly<Ref<string>> } {
  const { today } = useToday()
  useAppResume(reload)

  return { today }
}
