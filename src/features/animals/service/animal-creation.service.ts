import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import {
  getWeightRepository,
  type WeightRepository,
} from '@/features/weight/repository/weight.repository'
import { getAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'
import {
  animalCreationInputSchema,
  type Animal,
  type AnimalCreationInput,
} from '../schema/animal.schema'

type Provider<T> = () => T | Promise<T>

export function createAnimalCreationService(
  animals: Provider<Pick<AnimalsRepository, 'create'>>,
  weight: Provider<Pick<WeightRepository, 'createStatement'>>,
) {
  return {
    /** L'animal et sa première pesée, datée du jour, en une transaction. */
    async create(input: AnimalCreationInput): Promise<Animal> {
      const { weightKg, ...animal } = animalCreationInputSchema.parse(input)
      const [animalsRepository, weightRepository] = await Promise.all([animals(), weight()])

      return animalsRepository.create(animal, ({ id, createdAt }) =>
        weightKg === null
          ? []
          : [
              weightRepository.createStatement(
                { animalId: id, weightKg, measuredOn: todayIsoDate() },
                createdAt,
              ),
            ],
      )
    },
  }
}

export type AnimalCreationService = ReturnType<typeof createAnimalCreationService>

export const animalCreationService = createAnimalCreationService(
  getAnimalsRepository,
  getWeightRepository,
)
