import i18n from '@/core/i18n'
import { getAnimalsRepository, type AnimalsRepository } from '@/features/animals/animals.repository'
import type { Translate } from '@/shared/due-reminders'
import {
  cancelDueReminders,
  reminderNotifications,
  replaceDueReminders,
  type ReminderNotifications,
} from '@/shared/due-reminders-schedule'
import { vaccinationReminders } from './vaccination-reminders'
import type { Vaccination } from './vaccination.schema'

type Provider<T> = () => T | Promise<T>

export type VaccinationRemindersDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'getById'>>
  notifications: ReminderNotifications
  t: Translate
  now: () => Date
}

/** Aucune méthode ne lève : un échec du plugin ne doit pas faire échouer l'écriture du vaccin. */
export function createVaccinationRemindersService({
  animals,
  notifications,
  t,
  now,
}: VaccinationRemindersDependencies) {
  return {
    async reschedule(vaccination: Vaccination): Promise<void> {
      await replaceDueReminders(
        notifications,
        { kind: 'vaccination', id: vaccination.id },
        async () => {
          const animal = await (await animals()).getById(vaccination.animalId)
          return vaccinationReminders(t, vaccination, animal, now())
        },
      )
    },

    async cancel(id: string): Promise<void> {
      await cancelDueReminders(notifications, [{ kind: 'vaccination', id }])
    },
  }
}

export type VaccinationRemindersService = ReturnType<typeof createVaccinationRemindersService>

export const vaccinationRemindersService = createVaccinationRemindersService({
  animals: getAnimalsRepository,
  notifications: reminderNotifications,
  t: i18n.global.t,
  now: () => new Date(),
})
