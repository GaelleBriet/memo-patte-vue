import type { VaccinationsRepositoryProvider } from '../store/vaccinations.store'
import { fakeRepository } from '@/shared/__tests__/fake-repository'

export type StoreVaccinationsRepository = Awaited<ReturnType<VaccinationsRepositoryProvider>>

/** Repository du store des vaccins, vide par défaut : un test ne fournit que ce qu'il lit. */
export function fakeVaccinationsRepository(methods: Partial<StoreVaccinationsRepository> = {}) {
  return fakeRepository<StoreVaccinationsRepository>({
    listByAnimal: async () => [],
    getById: async () => null,
    listInjections: async () => [],
    ...methods,
  })
}
