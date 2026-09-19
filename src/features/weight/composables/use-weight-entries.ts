import { computed } from 'vue'

import { useWeightStore } from '../store/weight.store'
import { useAnimalScopedLoad } from '@/shared/composables/use-animal-scoped-load'

/**
 * Pesées d'un animal pour une vue, chargées à chaque changement d'animal et au retour au premier plan.
 *
 * Seul un changement d'animal masque la liste : pendant une écriture ou une relecture,
 * la liste déjà affichée reste en place jusqu'à son remplacement.
 */
export function useWeightEntries(animalId: () => string) {
  const store = useWeightStore()
  const { loadedFor, isLoading, reload } = useAnimalScopedLoad(animalId, (id) =>
    store.loadForAnimal(id),
  )

  // Tant que le store porte un autre animal, sa liste n'est pas celle-ci.
  const isStoreForAnimal = computed(() => store.animalId === animalId())
  const hasError = computed(
    () => !isLoading.value && isStoreForAnimal.value && store.error !== null,
  )
  const isReady = computed(
    () =>
      loadedFor.value === animalId() &&
      isStoreForAnimal.value &&
      store.hasLoaded &&
      store.error === null,
  )
  const entries = computed(() => (isReady.value ? store.entries : []))

  return { entries, isLoading, hasError, isReady, reload }
}
