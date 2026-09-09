import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { Treatment, TreatmentInput, TreatmentUpdateInput } from './treatment.schema'
import type { TreatmentsRepository as FullTreatmentsRepository } from './treatments.repository'

// Le store ne dépend que de ce qu'il appelle : la cascade de suppression (#102) n'est pas son affaire.
type TreatmentsRepository = Pick<
  FullTreatmentsRepository,
  'getById' | 'listByAnimal' | 'create' | 'update' | 'remove'
>

export type TreatmentsRepositoryProvider = () =>
  TreatmentsRepository | Promise<TreatmentsRepository>

let provider: TreatmentsRepositoryProvider | null = null

export function provideTreatmentsRepository(next: TreatmentsRepositoryProvider | null): void {
  provider = next
}

export const useTreatmentsStore = defineStore('treatments', () => {
  /** Traitements de l'animal chargé, prochaine échéance croissante telle que rendue par le repository. */
  const treatments = ref<Treatment[]>([])
  /** Animal dont la liste est chargée, `null` tant qu'aucune n'a été demandée. */
  const animalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « aucun traitement ». */
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  function requireRepository(): Promise<TreatmentsRepository> {
    if (!provider) {
      throw new Error('Repository des traitements absent : appelle provideTreatmentsRepository().')
    }
    return Promise.resolve(provider())
  }

  async function refresh(repository: TreatmentsRepository, id: string): Promise<void> {
    animalId.value = id
    treatments.value = await repository.listByAnimal(id)
    hasLoaded.value = true
    error.value = null
  }

  // Une écriture ne relit que la liste déjà affichée : celle d'un autre animal reste à charger.
  async function write<T>(
    operation: (repository: TreatmentsRepository) => Promise<T>,
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
    treatments,
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

    async getById(id: string): Promise<Treatment | null> {
      return (await requireRepository()).getById(id)
    },

    async create(input: TreatmentInput): Promise<Treatment> {
      return write(
        (repository) => repository.create(input),
        (created) => created.animalId,
      )
    },

    async update(id: string, input: TreatmentUpdateInput): Promise<Treatment> {
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
