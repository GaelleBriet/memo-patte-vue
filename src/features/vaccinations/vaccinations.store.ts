import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { Vaccination, VaccinationInput, VaccinationUpdateInput } from './vaccination.schema'
import type { VaccinationsRepository } from './vaccinations.repository'

export type VaccinationsRepositoryProvider = () =>
  VaccinationsRepository | Promise<VaccinationsRepository>

let provider: VaccinationsRepositoryProvider | null = null

export function provideVaccinationsRepository(next: VaccinationsRepositoryProvider | null): void {
  provider = next
}

export const useVaccinationsStore = defineStore('vaccinations', () => {
  const vaccinations = ref<Vaccination[]>([])
  /** Animal dont la liste est chargée, `null` tant qu'aucune n'a été demandée. */
  const animalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « aucun vaccin ». */
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  function requireRepository(): Promise<VaccinationsRepository> {
    if (!provider) {
      throw new Error('Repository des vaccins absent : appelle provideVaccinationsRepository().')
    }
    return Promise.resolve(provider())
  }

  async function refresh(repository: VaccinationsRepository, id: string): Promise<void> {
    animalId.value = id
    vaccinations.value = await repository.listByAnimal(id)
    hasLoaded.value = true
    error.value = null
  }

  // Une écriture ne relit que la liste déjà affichée : celle d'un autre animal reste à charger.
  async function write<T>(
    operation: (repository: VaccinationsRepository) => Promise<T>,
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
    vaccinations,
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

    async getById(id: string): Promise<Vaccination | null> {
      return (await requireRepository()).getById(id)
    },

    async create(input: VaccinationInput): Promise<Vaccination> {
      return write(
        (repository) => repository.create(input),
        (created) => created.animalId,
      )
    },

    async update(id: string, input: VaccinationUpdateInput): Promise<Vaccination> {
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
