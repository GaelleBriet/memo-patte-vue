import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import { getVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { getTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { getTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { getWeightRepository } from '@/features/weight/repository/weight.repository'
import { deletePhoto, type PhotoStorage } from '@/core/photos/photo-storage'
import { getAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'
import { animalRemindersService, type AnimalRemindersService } from './animal-reminders.service'

type Provider<T> = () => T | Promise<T>

/** Ce qu'un repository du carnet doit offrir pour suivre la suppression de son animal. */
export type AnimalRecordRepository = Pick<
  VaccinationsRepository,
  'markDeletedByAnimalStatement' | 'reviveByAnimalStatement'
>

/** Ce que `restore` et `forgetPhoto` reprennent d'une suppression. */
export type AnimalRemoval = {
  animalId: string
  deletedAt: string
  photoPath: string | null
}

export function createAnimalDeletionService(
  animals: Provider<Pick<AnimalsRepository, 'getById' | 'remove' | 'restore'>>,
  records: Provider<AnimalRecordRepository>[],
  reminders: Pick<AnimalRemindersService, 'entriesOf' | 'withdrawEntries' | 'reschedule'>,
  photos: Pick<PhotoStorage, 'deletePhoto'>,
) {
  async function repositories() {
    return Promise.all([animals(), Promise.all(records.map((record) => record()))])
  }

  return {
    /**
     * Marque l'animal et tout son carnet en une transaction, avec une seule date, puis retire ses
     * rappels, volet compris ; la photo reste jusqu'à `forgetPhoto`. `null` pour un animal inconnu ou déjà supprimé.
     */
    async remove(animalId: string): Promise<AnimalRemoval | null> {
      const deletedAt = new Date().toISOString()
      const [animalsRepository, recordRepositories] = await repositories()
      // Lus avant la transaction : une fois supprimés, l'animal et ses entrées ne sont plus lus.
      const [animal, reminded] = await Promise.all([
        animalsRepository.getById(animalId),
        reminders.entriesOf(animalId),
      ])
      if (animal === null) return null
      const cascade = recordRepositories.map((repository) =>
        repository.markDeletedByAnimalStatement(animalId, deletedAt),
      )
      await animalsRepository.remove(animalId, cascade, deletedAt)
      await reminders.withdrawEntries(reminded)
      return { animalId, deletedAt, photoPath: animal.photoPath }
    },

    /**
     * Rend l'animal et les lignes de son carnet supprimées avec lui, puis reprogramme ses rappels.
     * Lève sans rien rendre si l'animal n'est plus supprimé à cet instant.
     */
    async restore({ animalId, deletedAt }: AnimalRemoval): Promise<void> {
      const at = new Date().toISOString()
      const [animalsRepository, recordRepositories] = await repositories()
      const revive = recordRepositories.map((repository) =>
        repository.reviveByAnimalStatement(animalId, deletedAt, at),
      )
      await animalsRepository.restore(animalId, deletedAt, revive)
      await reminders.reschedule(animalId)
    },

    /** Efface la copie de la photo d'un animal resté supprimé ; ne lève pas. */
    async forgetPhoto({ animalId, photoPath }: AnimalRemoval): Promise<void> {
      if (photoPath === null) return
      try {
        if ((await (await animals()).getById(animalId)) !== null) return
        await photos.deletePhoto(photoPath)
      } catch {
        // Un fichier orphelin ne vaut pas l'échec d'une suppression déjà en base.
      }
    },
  }
}

export type AnimalDeletionService = ReturnType<typeof createAnimalDeletionService>

export const animalDeletionService = createAnimalDeletionService(
  getAnimalsRepository,
  [
    getVaccinationsRepository,
    getVaccinationInjectionsRepository,
    getWeightRepository,
    getTreatmentsRepository,
    getTreatmentPeriodsRepository,
    getTreatmentDosesRepository,
  ],
  animalRemindersService,
  { deletePhoto },
)
