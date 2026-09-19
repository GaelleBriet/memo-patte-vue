import i18n from '@/core/i18n'
import { getAnimalsRepository, type AnimalsRepository } from '@/features/animals/animals.repository'
import type { Translate } from '@/shared/domain/due-reminders'
import {
  cancelDueReminders,
  reminderNotifications,
  replaceDueReminders,
  type ReminderNotifications,
} from '@/shared/domain/due-reminders-schedule'
import { treatmentReminders } from './treatment-reminders'
import type { Treatment } from './treatment.schema'

type Provider<T> = () => T | Promise<T>

export type TreatmentRemindersDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'getById'>>
  notifications: ReminderNotifications
  t: Translate
  now: () => Date
}

/** Aucune méthode ne lève : un échec du plugin ne doit pas faire échouer l'écriture du traitement. */
export function createTreatmentRemindersService({
  animals,
  notifications,
  t,
  now,
}: TreatmentRemindersDependencies) {
  return {
    async reschedule(treatment: Treatment): Promise<void> {
      await replaceDueReminders(
        notifications,
        { kind: 'treatment', id: treatment.id },
        async () => {
          const animal = await (await animals()).getById(treatment.animalId)
          return treatmentReminders(t, treatment, animal, now())
        },
      )
    },

    async cancel(id: string): Promise<void> {
      await cancelDueReminders(notifications, [{ kind: 'treatment', id }])
    },
  }
}

export type TreatmentRemindersService = ReturnType<typeof createTreatmentRemindersService>

export const treatmentRemindersService = createTreatmentRemindersService({
  animals: getAnimalsRepository,
  notifications: reminderNotifications,
  t: i18n.global.t,
  now: () => new Date(),
})
