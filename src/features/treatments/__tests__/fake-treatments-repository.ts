import type { TreatmentsRepositoryProvider } from '../store/treatments.store'
import { fakeRepository } from '@/shared/__tests__/fake-repository'

export type StoreTreatmentsRepository = Awaited<ReturnType<TreatmentsRepositoryProvider>>

/** Repository du store des traitements, vide par défaut : un test ne fournit que ce qu'il lit. */
export function fakeTreatmentsRepository(methods: Partial<StoreTreatmentsRepository> = {}) {
  return fakeRepository<StoreTreatmentsRepository>({
    listWithHistoryByAnimal: async () => [],
    getById: async () => null,
    listDoses: async () => [],
    ...methods,
  })
}
