import type { WeightRepositoryProvider } from '../store/weight.store'
import { fakeRepository } from '@/shared/__tests__/fake-repository'

export type StoreWeightRepository = Awaited<ReturnType<WeightRepositoryProvider>>

/** Repository du store des pesées, vide par défaut : un test ne fournit que ce qu'il lit. */
export function fakeWeightRepository(methods: Partial<StoreWeightRepository> = {}) {
  return fakeRepository<StoreWeightRepository>({ listByAnimal: async () => [], ...methods })
}
