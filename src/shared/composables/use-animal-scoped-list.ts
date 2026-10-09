import { ref, type Ref } from 'vue'

/** État d'un store qui tient la liste d'un seul animal à la fois, et ses chargements. */
export function useAnimalScopedList<Item, Repository>(
  requireRepository: () => Promise<Repository>,
  listByAnimal: (repository: Repository, animalId: string) => Promise<Item[]>,
) {
  const items = ref<Item[]>([]) as Ref<Item[]>
  /** Animal dont la liste est chargée, `null` tant qu'aucune n'a été demandée. */
  const animalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « liste vide ». */
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  async function refresh(repository: Repository, id: string): Promise<void> {
    const list = await listByAnimal(repository, id)
    // Un chargement lancé entre-temps pour un autre animal a priorité sur cette réponse.
    if (animalId.value !== id) return
    items.value = list
    hasLoaded.value = true
    error.value = null
  }

  /**
   * Ne lève pas : renvoie `false` et renseigne `error`. Renvoie aussi `true` quand la réponse
   * est ignorée parce qu'un autre animal a été demandé entre-temps.
   */
  async function loadForAnimal(id: string): Promise<boolean> {
    isLoading.value = true
    animalId.value = id
    try {
      await refresh(await requireRepository(), id)
      return true
    } catch (cause) {
      if (animalId.value !== id) return false
      error.value = cause instanceof Error ? cause : new Error(String(cause))
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Une écriture ne relit que la liste déjà affichée : celle d'un autre animal reste à charger.
  async function write<T>(
    operation: (repository: Repository) => Promise<T>,
    touchedAnimalId: (result: T) => string | null,
  ): Promise<T> {
    isLoading.value = true
    try {
      const repository = await requireRepository()
      const result = await operation(repository)
      const touched = touchedAnimalId(result)
      if (touched !== null && touched === animalId.value) {
        await refresh(repository, touched)
      }
      return result
    } finally {
      isLoading.value = false
    }
  }

  return { items, animalId, isLoading, hasLoaded, error, loadForAnimal, write }
}
