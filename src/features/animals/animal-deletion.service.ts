import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/treatments.repository'
import { getWeightRepository } from '@/features/weight/weight.repository'
import type { DueReminderEntry } from '@/shared/due-reminders'
import {
  cancelDueReminders,
  reminderNotifications,
  type ReminderNotifications,
} from '@/shared/due-reminders-schedule'
import { getAnimalsRepository, type AnimalsRepository } from './animals.repository'

type Provider<T> = () => T | Promise<T>

/** Ce qu'un repository du carnet doit offrir pour suivre la suppression de son animal. */
export type AnimalRecordRepository = Pick<VaccinationsRepository, 'markDeletedByAnimalStatement'>

export type AnimalRemindersDependencies = {
  vaccinations: Provider<Pick<VaccinationsRepository, 'listByAnimal'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listByAnimal'>>
  notifications: Pick<ReminderNotifications, 'cancelReminder' | 'listScheduled'>
}

export function createAnimalDeletionService(
  animals: Provider<AnimalsRepository>,
  records: Provider<AnimalRecordRepository>[],
  reminders: AnimalRemindersDependencies,
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

  return {
    /** Marque l'animal et tout son carnet en une transaction, avec une seule date, puis annule ses rappels. */
    async remove(animalId: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      const [animalsRepository, ...recordRepositories] = await Promise.all([
        animals(),
        ...records.map((record) => record()),
      ])
      // Lu avant la transaction : une fois supprimées, les entrées ne sont plus listées.
      const reminded = await remindedEntries(animalId)
      const cascade = recordRepositories.map((repository) =>
        repository.markDeletedByAnimalStatement(animalId, deletedAt),
      )
      await animalsRepository.remove(animalId, cascade, deletedAt)
      await cancelDueReminders(reminders.notifications, reminded)
    },
  }
}

export type AnimalDeletionService = ReturnType<typeof createAnimalDeletionService>

export const animalDeletionService = createAnimalDeletionService(
  getAnimalsRepository,
  [getVaccinationsRepository, getWeightRepository, getTreatmentsRepository],
  {
    vaccinations: getVaccinationsRepository,
    treatments: getTreatmentsRepository,
    notifications: reminderNotifications,
  },
)
