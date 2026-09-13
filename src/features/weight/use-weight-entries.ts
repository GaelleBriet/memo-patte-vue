import { computed, ref, watch } from 'vue'

import { useWeightStore } from './weight.store'

/**
 * Pesées d'un animal pour une vue, qui les charge à chaque changement d'animal.
 *
 * Seul le chargement lancé ici masque la liste : pendant une écriture (`store.isLoading`
 * est vrai aussi), la liste déjà affichée reste en place jusqu'à sa relecture.
 */
export function useWeightEntries(animalId: () => string) {
  const store = useWeightStore()
  const loadingFor = ref<string | null>(null)

  async function load(): Promise<void> {
    const id = animalId()
    loadingFor.value = id
    await store.loadForAnimal(id)
    if (loadingFor.value === id) loadingFor.value = null
  }

  watch(animalId, () => void load(), { immediate: true })

  const isLoading = computed(() => loadingFor.value !== null)
  // Tant que le store porte un autre animal, sa liste n'est pas celle-ci.
  const isForAnimal = computed(() => !isLoading.value && store.animalId === animalId())
  const hasError = computed(() => isForAnimal.value && store.error !== null)
  const isReady = computed(() => isForAnimal.value && store.hasLoaded && store.error === null)
  const entries = computed(() => (isReady.value ? store.entries : []))

  return { entries, isLoading, hasError, isReady, reload: load }
}
