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
} from '@/shared/domain/due-reminders-schedule'
import type { CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import { treatmentReminders } from '../logic/treatment-reminders'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import type { Translate } from '@/core/i18n/translate'

type Provider<T> = () => T | Promise<T>

export type TreatmentRemindersDependencies = {
  treatments: Provider<Pick<TreatmentsRepository, 'getWithHistory'>>
  animals: Provider<Pick<AnimalsRepository, 'getById'>>
  settings?: Provider<CarnetReminderSettings>
  notifications: ReminderNotifications
  t: Translate
  now: () => Date
}

/** Aucune méthode ne lève : un échec du plugin ne doit pas faire échouer l'écriture du traitement. */
export function createTreatmentRemindersService({
  treatments,
  animals,
  settings = carnetReminderSettings,
  notifications,
  t,
  now,
}: TreatmentRemindersDependencies) {
  return {
    /** Relit le traitement et son historique dans la file des rappels : supprimé, il n'a plus de rappel. */
    async reschedule(id: string): Promise<void> {
      await replaceDueReminders(notifications, { kind: 'treatment', id }, async () => {
        const treatment = await (await treatments()).getWithHistory(id)
        if (treatment === null) return { care: null, isNoted: () => false }
        const animal = await (await animals()).getById(treatment.animalId)
        return treatmentReminders(t, treatment, animal, await settings(), now())
      })
    },
  }
}

export type TreatmentRemindersService = ReturnType<typeof createTreatmentRemindersService>

export const treatmentRemindersService = createTreatmentRemindersService({
  treatments: getTreatmentsRepository,
  animals: getAnimalsRepository,
  notifications: reminderNotifications,
  t: i18n.global.t,
  now: () => new Date(),
})
