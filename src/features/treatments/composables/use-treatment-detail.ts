import { useDetailLoad } from '@/shared/composables/use-detail-load'
import { useTreatmentsStore } from '../store/treatments.store'

/** Un traitement et ses prises, la tête d'abord. */
export function useTreatmentDetail(id: () => string) {
  const store = useTreatmentsStore()
  return useDetailLoad(id, async (treatmentId) => {
    const [treatment, doses] = await Promise.all([
      store.getById(treatmentId),
      store.listDoses(treatmentId),
    ])
    return treatment === null ? null : { treatment, doses }
  })
}
