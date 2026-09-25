import i18n from '@/core/i18n'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import type { Translate } from '@/shared/domain/due-reminders'
import {
  reminderNotifications,
  replaceDueReminders,
  type ReminderNotifications,
} from '@/shared/domain/due-reminders-schedule'
import { isInjectionNoted, vaccinationReminders } from '../logic/vaccination-reminders'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '../repository/vaccinations.repository'

type Provider<T> = () => T | Promise<T>

export type VaccinationRemindersDependencies = {
  vaccinations: Provider<Pick<VaccinationsRepository, 'getById'>>
  animals: Provider<Pick<AnimalsRepository, 'getById'>>
  notifications: ReminderNotifications
  t: Translate
  now: () => Date
}

/** Aucune méthode ne lève : un échec du plugin ne doit pas faire échouer l'écriture du vaccin. */
export function createVaccinationRemindersService({
  vaccinations,
  animals,
  notifications,
  t,
  now,
}: VaccinationRemindersDependencies) {
  return {
    /** Relit le vaccin dans la file des rappels : supprimé, il n'a plus de rappel. */
    async reschedule(id: string): Promise<void> {
      await replaceDueReminders(notifications, { kind: 'vaccination', id }, async () => {
        const vaccination = await (await vaccinations()).getById(id)
        if (vaccination === null) return { reminders: [], isNoted: () => false }
        const animal = await (await animals()).getById(vaccination.animalId)
        return {
          reminders: vaccinationReminders(t, vaccination, animal, now()),
          isNoted: (dueDate: string) => isInjectionNoted(vaccination, dueDate),
        }
      })
    },
  }
}

export type VaccinationRemindersService = ReturnType<typeof createVaccinationRemindersService>

export const vaccinationRemindersService = createVaccinationRemindersService({
  vaccinations: getVaccinationsRepository,
  animals: getAnimalsRepository,
  notifications: reminderNotifications,
  t: i18n.global.t,
  now: () => new Date(),
})
