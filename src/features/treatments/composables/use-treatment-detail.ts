import { computed } from 'vue'

import { useToday } from '@/core/app-lifecycle/use-today'
import { useDetailLoad } from '@/shared/composables/use-detail-load'
import { treatmentReading } from '@/shared/domain/treatment-reading'
import { readableScheduleOf } from '../logic/treatment-schedule-adapter'
import { useTreatmentsStore } from '../store/treatments.store'

/**
 * Un traitement, ses périodes et ses prises : `view`, sa lecture (R12) ; `schedule`, l'ancien moteur
 * que les gestes lisent encore ; `unreadable` : l'un ou l'autre le refuse.
 */
export function useTreatmentDetail(id: () => string) {
  const store = useTreatmentsStore()
  const { today, refresh: refreshToday } = useToday()
  const { data, state, reload } = useDetailLoad(id, (treatmentId) =>
    store.getWithHistory(treatmentId),
  )

  const schedule = computed(() => readableScheduleOf(data.value, today.value))
  const view = computed(() => (data.value ? treatmentReading(data.value, today.value) : null))
  const unreadable = computed(
    () => data.value !== null && (schedule.value === null || view.value === null),
  )

  return { treatment: data, schedule, view, today, refreshToday, state, unreadable, reload }
}
