import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from '@/features/treatments/service/treatment-reminders.service'
import { getVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import {
  vaccinationRemindersService,
  type VaccinationRemindersService,
} from '@/features/vaccinations/service/vaccination-reminders.service'
import type { DueReminderEntry } from '@/shared/domain/due-reminders'
import {
  reminderNotifications,
  withdrawDueReminders,
  type ReminderNotifications,
} from '@/shared/domain/due-reminders-schedule'

type Provider<T> = () => T | Promise<T>

type CareListing = { listByAnimal: (animalId: string) => Promise<{ id: string }[]> }

export type AnimalRemindersDependencies = {
  vaccinations: Provider<CareListing>
  treatments: Provider<CareListing>
  vaccinationReminders: Pick<VaccinationRemindersService, 'reschedule'>
  treatmentReminders: Pick<TreatmentRemindersService, 'reschedule'>
  notifications: Pick<
    ReminderNotifications,
    'cancelReminders' | 'listScheduled' | 'removeDelivered'
  >
}

/** Les rappels de tous les soins d'un animal ; aucune méthode ne lève pour un échec du plugin. */
export function createAnimalRemindersService({
  vaccinations,
  treatments,
  vaccinationReminders,
  treatmentReminders,
  notifications,
}: AnimalRemindersDependencies) {
  async function entriesOf(animalId: string): Promise<DueReminderEntry[]> {
    const [vaccinationRows, treatmentRows] = await Promise.all([
      (await vaccinations()).listByAnimal(animalId),
      (await treatments()).listByAnimal(animalId),
    ])
    return [
      ...vaccinationRows.map(({ id }): DueReminderEntry => ({ kind: 'vaccination', id })),
      ...treatmentRows.map(({ id }): DueReminderEntry => ({ kind: 'treatment', id })),
    ]
  }

  return {
    /** Soins visibles de l'animal : à lire avant de le supprimer. */
    entriesOf,

    /** Rappels en attente annulés et notifications affichées retirées du volet, pour ces soins. */
    withdrawEntries(entries: DueReminderEntry[]): Promise<void> {
      return withdrawDueReminders(notifications, entries)
    },

    /** Comme `withdrawEntries`, pour tous les soins visibles de l'animal. */
    async withdraw(animalId: string): Promise<void> {
      await withdrawDueReminders(notifications, await entriesOf(animalId))
    },

    async reschedule(animalId: string): Promise<void> {
      await Promise.all(
        (await entriesOf(animalId)).map(({ kind, id }) =>
          kind === 'vaccination'
            ? vaccinationReminders.reschedule(id)
            : treatmentReminders.reschedule(id),
        ),
      )
    },
  }
}

export type AnimalRemindersService = ReturnType<typeof createAnimalRemindersService>

export const animalRemindersService = createAnimalRemindersService({
  vaccinations: getVaccinationsRepository,
  treatments: getTreatmentsRepository,
  vaccinationReminders: vaccinationRemindersService,
  treatmentReminders: treatmentRemindersService,
  notifications: reminderNotifications,
})
