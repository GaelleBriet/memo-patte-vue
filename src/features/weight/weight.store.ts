import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { WeightEntry, WeightEntryInput, WeightEntryUpdateInput } from './weight.schema'
import type { WeightRepository as FullWeightRepository } from './weight.repository'

// Le store ne dépend que de ce qu'il appelle : la cascade de suppression (#102) n'est pas son affaire.
type WeightRepository = Pick<FullWeightRepository, 'listByAnimal' | 'create' | 'update' | 'remove'>

export type WeightRepositoryProvider = () => WeightRepository | Promise<WeightRepository>

let provider: WeightRepositoryProvider | null = null

export function provideWeightRepository(next: WeightRepositoryProvider | null): void {
  provider = next
}

export const useWeightStore = defineStore('weight', () => {
  /** Pesées de l'animal chargé, dans l'ordre chronologique croissant rendu par le repository. */
  const entries = ref<WeightEntry[]>([])
  /** Animal dont la liste est chargée, `null` tant qu'aucune n'a été demandée. */
  const animalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « aucune pesée ». */
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  function requireRepository(): Promise<WeightRepository> {
    if (!provider) {
      throw new Error('Repository des pesées absent : appelle provideWeightRepository().')
    }
    return Promise.resolve(provider())
  }

  async function refresh(repository: WeightRepository, id: string): Promise<void> {
    animalId.value = id
    entries.value = await repository.listByAnimal(id)
    hasLoaded.value = true
    error.value = null
  }

  // Une écriture ne relit que la liste déjà affichée : celle d'un autre animal reste à charger.
  async function write<T>(
    operation: (repository: WeightRepository) => Promise<T>,
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

  return {
    entries,
    animalId,
    isLoading,
    hasLoaded,
    error,

    /** Ne lève pas : renvoie `false` et renseigne `error`. */
    async loadForAnimal(id: string): Promise<boolean> {
      isLoading.value = true
      try {
        await refresh(await requireRepository(), id)
        return true
      } catch (cause) {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
        return false
      } finally {
        isLoading.value = false
      }
    },

    async create(input: WeightEntryInput): Promise<WeightEntry> {
      return write(
        (repository) => repository.create(input),
        (created) => created.animalId,
      )
    },

    async update(id: string, input: WeightEntryUpdateInput): Promise<WeightEntry> {
      return write(
        (repository) => repository.update(id, input),
        (updated) => updated.animalId,
      )
    },

    async remove(id: string): Promise<void> {
      await write(
        (repository) => repository.remove(id),
        () => animalId.value,
      )
    },
  }
})
