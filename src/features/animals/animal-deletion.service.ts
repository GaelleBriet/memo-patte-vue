import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import { getTreatmentsRepository } from '@/features/treatments/treatments.repository'
import { getWeightRepository } from '@/features/weight/weight.repository'
import { getAnimalsRepository, type AnimalsRepository } from './animals.repository'

type Provider<T> = () => T | Promise<T>

/** Ce qu'un repository du carnet doit offrir pour suivre la suppression de son animal. */
export type AnimalRecordRepository = Pick<VaccinationsRepository, 'markDeletedByAnimalStatement'>

export function createAnimalDeletionService(
  animals: Provider<AnimalsRepository>,
  records: Provider<AnimalRecordRepository>[],
) {
  return {
    /** Marque l'animal et tout son carnet, en une transaction, avec une seule date. */
    async remove(animalId: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      const [animalsRepository, ...recordRepositories] = await Promise.all([
        animals(),
        ...records.map((record) => record()),
      ])
      const cascade = recordRepositories.map((repository) =>
        repository.markDeletedByAnimalStatement(animalId, deletedAt),
      )
      await animalsRepository.remove(animalId, cascade, deletedAt)
    },
  }
}

export type AnimalDeletionService = ReturnType<typeof createAnimalDeletionService>

export const animalDeletionService = createAnimalDeletionService(getAnimalsRepository, [
  getVaccinationsRepository,
  getWeightRepository,
  getTreatmentsRepository,
])
