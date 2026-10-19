import { computed } from 'vue'

import { useToday } from '@/core/app-lifecycle/use-today'
import { useDetailLoad } from '@/shared/composables/use-detail-load'
import { readableReadingOf } from '../logic/treatment-reading-adapter'
import { useTreatmentsStore } from '../store/treatments.store'

/** Un traitement, ses périodes et ses prises, avec sa lecture du jour ; `unreadable` : le moteur le refuse. */
export function useTreatmentDetail(id: () => string) {
  const store = useTreatmentsStore()
  const { today, refresh: refreshToday } = useToday()
  const { data, state, reload } = useDetailLoad(id, (treatmentId) =>
    store.getWithPeriods(treatmentId),
  )

  const reading = computed(() => readableReadingOf(data.value, today.value))
  const unreadable = computed(() => data.value !== null && reading.value === null)

  return { treatment: data, reading, today, refreshToday, state, unreadable, reload }
}
