import i18n from '@/core/i18n'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import {
  carnetReminderSettings,
  reminderNotifications,
  replaceDueReminders,
  type ReminderNotifications,
} from '@/core/notifications/due-reminders-schedule'
import type { CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import { vaccinationReminders } from '@/shared/domain/vaccination-reminders'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '../repository/vaccinations.repository'
import type { Translate } from '@/core/i18n/translate'

type Provider<T> = () => T | Promise<T>

export type VaccinationRemindersDependencies = {
  vaccinations: Provider<Pick<VaccinationsRepository, 'getById' | 'listReplacedDues'>>
  animals: Provider<Pick<AnimalsRepository, 'getById'>>
  settings?: Provider<CarnetReminderSettings>
  notifications: ReminderNotifications
  t: Translate
  now: () => Date
}

/** Aucune méthode ne lève : un échec du plugin ne doit pas faire échouer l'écriture du vaccin. */
export function createVaccinationRemindersService({
  vaccinations,
  animals,
  settings = carnetReminderSettings,
  notifications,
  t,
  now,
}: VaccinationRemindersDependencies) {
  return {
    /** Relit le vaccin dans la file des rappels : supprimé, il n'a plus de rappel. */
    async reschedule(id: string): Promise<void> {
      await replaceDueReminders(notifications, { kind: 'vaccination', id }, async () => {
        const repository = await vaccinations()
        const vaccination = await repository.getById(id)
        if (vaccination === null) return { care: null, isNoted: () => false }
        const replacedDues = await repository.listReplacedDues(id)
        const animal = await (await animals()).getById(vaccination.animalId)
        return vaccinationReminders(
          t,
          { ...vaccination, replacedDues },
          animal,
          await settings(),
          now(),
        )
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
