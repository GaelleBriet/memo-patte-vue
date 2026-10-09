import { defineStore } from 'pinia'

import type { WeightEntry, WeightEntryInput, WeightEntryUpdateInput } from '../schema/weight.schema'
import type { WeightRepository as FullWeightRepository } from '../repository/weight.repository'
import { track } from '@/core/analytics'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { useAnimalScopedList } from '@/shared/composables/use-animal-scoped-list'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

// Le store ne dépend que de ce qu'il appelle : la cascade de suppression (#102) n'est pas son affaire.
type WeightRepository = Pick<
  FullWeightRepository,
  'listByAnimal' | 'create' | 'update' | 'remove' | 'undoRemove'
>

export type WeightRepositoryProvider = () => WeightRepository | Promise<WeightRepository>

let provider: WeightRepositoryProvider | null = null

export function provideWeightRepository(next: WeightRepositoryProvider | null): void {
  provider = next
}

export const useWeightStore = defineStore('weight', () => {
  function requireRepository(): Promise<WeightRepository> {
    if (!provider) {
      throw new Error('Repository des pesées absent : appelle provideWeightRepository().')
    }
    return Promise.resolve(provider())
  }

  const {
    items: entries,
    animalId,
    isLoading,
    hasLoaded,
    error,
    loadForAnimal,
    write,
  } = useAnimalScopedList(requireRepository, (repository, id) => repository.listByAnimal(id))

  return {
    /** Pesées de l'animal chargé, dans l'ordre chronologique croissant rendu par le repository. */
    entries,
    animalId,
    isLoading,
    hasLoaded,
    error,
    loadForAnimal,

    async create(input: WeightEntryInput): Promise<WeightEntry> {
      const created = await write(
        (repository) => repository.create(input),
        (entry) => entry.animalId,
      )
      recordUsageSignal('entry')
      const species = useAnimalsStore().byId(created.animalId)?.species
      if (species) track('weight_added', { species })
      return created
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

    async undoRemove(id: string): Promise<void> {
      await write(
        (repository) => repository.undoRemove(id),
        () => animalId.value,
      )
    },
  }
})
