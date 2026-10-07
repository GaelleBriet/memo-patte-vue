import { computed } from 'vue'

import { useToday } from '@/core/app-lifecycle/use-today'
import { useDetailLoad } from '@/shared/composables/use-detail-load'
import { readableScheduleOf } from '../logic/treatment-schedule-adapter'
import { useTreatmentsStore } from '../store/treatments.store'

/** Un traitement, ses périodes et ses prises, avec son calendrier du jour ; `unreadable` : le moteur le refuse. */
export function useTreatmentDetail(id: () => string) {
  const store = useTreatmentsStore()
  const { today, refresh: refreshToday } = useToday()
  const { data, state, reload } = useDetailLoad(id, (treatmentId) =>
    store.getWithHistory(treatmentId),
  )

  const schedule = computed(() => readableScheduleOf(data.value, today.value))
  const unreadable = computed(() => data.value !== null && schedule.value === null)

  return { treatment: data, schedule, today, refreshToday, state, unreadable, reload }
}
