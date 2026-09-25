import { useDetailLoad } from '@/shared/composables/use-detail-load'
import { useVaccinationsStore } from '../store/vaccinations.store'

/** Un vaccin et ses injections, la tête d'abord. */
export function useVaccinationDetail(id: () => string) {
  const store = useVaccinationsStore()
  return useDetailLoad(id, async (vaccinationId) => {
    const [vaccination, injections] = await Promise.all([
      store.getById(vaccinationId),
      store.listInjections(vaccinationId),
    ])
    return vaccination === null ? null : { vaccination, injections }
  })
}
