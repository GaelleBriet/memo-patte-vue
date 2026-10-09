import { computed } from 'vue'

import { useAnimalScopedLoad } from './use-animal-scoped-load'

export type AnimalSectionStore = {
  readonly animalId: string | null
  readonly error: Error | null
  loadForAnimal(id: string): Promise<boolean>
}

/**
 * Charge la liste d'une section du Carnet ; `isCurrent` dit si le store porte la liste de cet
 * animal, `hasError` si son dernier chargement a échoué.
 */
export function useAnimalSectionLoad(animalId: () => string, store: AnimalSectionStore) {
  const { loadedFor } = useAnimalScopedLoad(animalId, (id) => store.loadForAnimal(id))

  const isLoadedFor = computed(
    () => loadedFor.value === animalId() && store.animalId === animalId(),
  )
  const isCurrent = computed(() => isLoadedFor.value && store.error === null)
  const hasError = computed(() => isLoadedFor.value && store.error !== null)

  return { isCurrent, hasError }
}
