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
import { isDoseNoted, treatmentReminders } from '../logic/treatment-reminders'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'

type Provider<T> = () => T | Promise<T>

export type TreatmentRemindersDependencies = {
  treatments: Provider<Pick<TreatmentsRepository, 'getById'>>
  animals: Provider<Pick<AnimalsRepository, 'getById'>>
  notifications: ReminderNotifications
  t: Translate
  now: () => Date
}

/** Aucune méthode ne lève : un échec du plugin ne doit pas faire échouer l'écriture du traitement. */
export function createTreatmentRemindersService({
  treatments,
  animals,
  notifications,
  t,
  now,
}: TreatmentRemindersDependencies) {
  return {
    /** Relit le traitement dans la file des rappels : supprimé ou arrêté, il n'a plus de rappel. */
    async reschedule(id: string): Promise<void> {
      await replaceDueReminders(notifications, { kind: 'treatment', id }, async () => {
        const treatment = await (await treatments()).getById(id)
        if (treatment === null) return { reminders: [], isNoted: () => false }
        const animal = await (await animals()).getById(treatment.animalId)
        return {
          reminders: treatmentReminders(t, treatment, animal, now()),
          isNoted: (dueDate: string) => isDoseNoted(treatment, dueDate),
        }
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
