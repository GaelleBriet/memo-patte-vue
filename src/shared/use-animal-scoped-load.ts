import { computed, readonly, ref, watch } from 'vue'

import { useAppResume } from '@/core/app-lifecycle/app-resume'

/**
 * Charge la liste d'un animal à chaque changement d'animal et à chaque retour au premier plan.
 * `loadedFor` : dernier animal dont le chargement est terminé, réussi ou non (l'erreur se lit
 * dans le store). Relire le même animal laisse donc sa liste affichée jusqu'au remplacement.
 */
export function useAnimalScopedLoad(
  animalId: () => string,
  load: (id: string) => Promise<boolean>,
) {
  const loadedFor = ref<string | null>(null)
  const loadingFor = ref<string | null>(null)

  async function reload(): Promise<void> {
    const id = animalId()
    if (loadedFor.value !== id) loadedFor.value = null
    loadingFor.value = id
    await load(id)
    if (animalId() !== id) return
    loadingFor.value = null
    loadedFor.value = id
  }

  watch(animalId, () => void reload(), { immediate: true })
  useAppResume(() => void reload())

  /** Vrai tant qu'aucun chargement de cet animal n'est terminé. */
  const isLoading = computed(() => loadingFor.value !== null && loadedFor.value !== animalId())

  return { loadedFor: readonly(loadedFor), isLoading, reload }
}
