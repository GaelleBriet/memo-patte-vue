import { computed } from 'vue'

import { useToday } from '@/core/app-lifecycle/use-today'
import { useDetailLoad } from '@/shared/composables/use-detail-load'
import type { TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import { useTreatmentsStore } from '../store/treatments.store'

/** Un traitement, ses périodes et ses prises, avec son calendrier du jour ; `unreadable` : le moteur le refuse. */
export function useTreatmentDetail(id: () => string) {
  const store = useTreatmentsStore()
  const { today } = useToday()
  const { data, state, reload } = useDetailLoad(id, (treatmentId) =>
    store.getWithHistory(treatmentId),
  )

  const schedule = computed((): TreatmentSchedule | null => {
    if (data.value === null) return null
    try {
      return treatmentScheduleOf(data.value, today.value)
    } catch (cause) {
      if (cause instanceof RangeError) return null
      throw cause
    }
  })
  const unreadable = computed(() => data.value !== null && schedule.value === null)

  return { treatment: data, schedule, today, state, unreadable, reload }
}
