import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Animal, AnimalInput } from './animal.schema'
import type { AnimalsRepository } from './animals.repository'

export type AnimalsRepositoryProvider = () => AnimalsRepository | Promise<AnimalsRepository>

let provider: AnimalsRepositoryProvider | null = null

export function provideAnimalsRepository(next: AnimalsRepositoryProvider | null): void {
  provider = next
}

export const useAnimalsStore = defineStore('animals', () => {
  const animals = ref<Animal[]>([])
  /** `null` signifie « tous les animaux ». */
  const selectedAnimalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « aucun animal ». */
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  const selectedAnimal = computed(
    () => animals.value.find((animal) => animal.id === selectedAnimalId.value) ?? null,
  )

  function requireRepository(): Promise<AnimalsRepository> {
    if (!provider) {
      throw new Error('Repository des animaux absent : appelle provideAnimalsRepository().')
    }
    return Promise.resolve(provider())
  }

  // Relire la liste est le seul moment où l'état affiché redevient sain.
  async function refresh(repository: AnimalsRepository): Promise<void> {
    animals.value = await repository.list()
    hasLoaded.value = true
    forgetSelectionIfGone()
    error.value = null
  }

  async function write<T>(operation: (repository: AnimalsRepository) => Promise<T>): Promise<T> {
    isLoading.value = true
    try {
      const repository = await requireRepository()
      const result = await operation(repository)
      await refresh(repository)
      return result
    } finally {
      isLoading.value = false
    }
  }

  function forgetSelectionIfGone(): void {
    if (selectedAnimal.value === null) {
      selectedAnimalId.value = null
    }
  }

  return {
    animals,
    selectedAnimalId,
    selectedAnimal,
    isLoading,
    hasLoaded,
    error,

    /** Ne lève pas : renvoie `false` et renseigne `error`. */
    async load(): Promise<boolean> {
      isLoading.value = true
      try {
        await refresh(await requireRepository())
        return true
      } catch (cause) {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
        return false
      } finally {
        isLoading.value = false
      }
    },

    async create(input: AnimalInput): Promise<Animal> {
      return write((repository) => repository.create(input))
    },

    async update(id: string, input: AnimalInput): Promise<Animal> {
      return write((repository) => repository.update(id, input))
    },

    async remove(id: string): Promise<void> {
      await write((repository) => repository.remove(id))
    },

    select(id: string | null): void {
      selectedAnimalId.value = id
    },
  }
})
