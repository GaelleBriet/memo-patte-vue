import { readonly, ref, type Ref } from 'vue'

import { useAppResume } from './app-resume'
import { todayIsoDate } from './today-iso-date'

/** Date du jour, recalculée au retour au premier plan ou à l'appel de `refresh`. */
export function useToday(): { today: Readonly<Ref<string>>; refresh: () => void } {
  const today = ref(todayIsoDate())

  function refresh(): void {
    today.value = todayIsoDate()
  }

  useAppResume(refresh)

  return { today: readonly(today), refresh }
}
