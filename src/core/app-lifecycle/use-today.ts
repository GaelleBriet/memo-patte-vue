import { format } from 'date-fns'
import { readonly, ref, type Ref } from 'vue'

import { useAppResume } from './app-resume'

function currentIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Date civile du jour (`yyyy-MM-dd`), recalculée à chaque retour au premier plan du composant appelant. */
export function useToday(): Readonly<Ref<string>> {
  const today = ref(currentIsoDate())

  useAppResume(() => {
    today.value = currentIsoDate()
  })

  return readonly(today)
}
