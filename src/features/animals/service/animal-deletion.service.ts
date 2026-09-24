import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import { getVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import { getTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { getWeightRepository } from '@/features/weight/repository/weight.repository'
import { deletePhoto, type PhotoStorage } from '@/core/photos/photo-storage'
import type { DueReminderEntry } from '@/shared/domain/due-reminders'
import {
  cancelDueReminders,
  reminderNotifications,
  type ReminderNotifications,
} from '@/shared/domain/due-reminders-schedule'
import { getAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'

type Provider<T> = () => T | Promise<T>

/** Ce qu'un repository du carnet doit offrir pour suivre la suppression de son animal. */
export type AnimalRecordRepository = Pick<VaccinationsRepository, 'markDeletedByAnimalStatement'>

export type AnimalRemindersDependencies = {
  vaccinations: Provider<Pick<VaccinationsRepository, 'listByAnimal'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listByAnimal'>>
  notifications: Pick<ReminderNotifications, 'cancelReminders' | 'listScheduled'>
}

export function createAnimalDeletionService(
  animals: Provider<AnimalsRepository>,
  records: Provider<AnimalRecordRepository>[],
  reminders: AnimalRemindersDependencies,
  photos: Pick<PhotoStorage, 'deletePhoto'>,
) {
  async function remindedEntries(animalId: string): Promise<DueReminderEntry[]> {
    const [vaccinationsRepository, treatmentsRepository] = await Promise.all([
      reminders.vaccinations(),
      reminders.treatments(),
    ])
    const [vaccinations, treatments] = await Promise.all([
      vaccinationsRepository.listByAnimal(animalId),
      treatmentsRepository.listByAnimal(animalId),
    ])
    return [
      ...vaccinations.map(({ id }): DueReminderEntry => ({ kind: 'vaccination', id })),
      ...treatments.map(({ id }): DueReminderEntry => ({ kind: 'treatment', id })),
    ]
  }

  async function forgetPhoto(name: string | null): Promise<void> {
    if (name === null) return
    try {
      await photos.deletePhoto(name)
    } catch {
      // Un fichier orphelin ne vaut pas l'échec d'une suppression déjà en base.
    }
  }

  return {
    /**
     * Marque l'animal et tout son carnet en une transaction, avec une seule date,
     * puis efface la copie de sa photo et annule ses rappels.
     */
    async remove(animalId: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      const [animalsRepository, ...recordRepositories] = await Promise.all([
        animals(),
        ...records.map((record) => record()),
      ])
      // Lus avant la transaction : une fois supprimés, l'animal et ses entrées ne sont plus lus.
      const [animal, reminded] = await Promise.all([
        animalsRepository.getById(animalId),
        remindedEntries(animalId),
      ])
      const cascade = recordRepositories.map((repository) =>
        repository.markDeletedByAnimalStatement(animalId, deletedAt),
      )
      await animalsRepository.remove(animalId, cascade, deletedAt)
      await forgetPhoto(animal?.photoPath ?? null)
      await cancelDueReminders(reminders.notifications, reminded)
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
    getTreatmentDosesRepository,
  ],
  {
    vaccinations: getVaccinationsRepository,
    treatments: getTreatmentsRepository,
    notifications: reminderNotifications,
  },
  { deletePhoto },
)
