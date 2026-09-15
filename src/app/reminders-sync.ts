import { onAppResume } from '@/core/app-lifecycle/app-resume'
import i18n from '@/core/i18n'
import { getAnimalsRepository, type AnimalsRepository } from '@/features/animals/animals.repository'
import { treatmentReminders } from '@/features/treatments/treatment-reminders'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/treatments.repository'
import { vaccinationReminders } from '@/features/vaccinations/vaccination-reminders'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import type { Translate } from '@/shared/due-reminders'
import { reminderNotifications, type ReminderNotifications } from '@/shared/due-reminders-schedule'

type Provider<T> = () => T | Promise<T>

export type RemindersSyncDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listAll'>>
  notifications: Pick<ReminderNotifications, 'checkPermission' | 'rescheduleAll'>
  t: Translate
  now: () => Date
}

export function createRemindersSync({
  animals,
  vaccinations,
  treatments,
  notifications,
  t,
  now,
}: RemindersSyncDependencies): () => Promise<void> {
  return async function syncAllReminders() {
    try {
      if (!(await notifications.checkPermission())) return

      const [animalsRepository, vaccinationsRepository, treatmentsRepository] = await Promise.all([
        animals(),
        vaccinations(),
        treatments(),
      ])
      const [animalRows, vaccinationRows, treatmentRows] = await Promise.all([
        animalsRepository.list(),
        vaccinationsRepository.listAll(),
        treatmentsRepository.listAll(),
      ])
      const animalsById = new Map(animalRows.map((animal) => [animal.id, animal]))
      const at = now()

      await notifications.rescheduleAll([
        ...vaccinationRows.flatMap((vaccination) =>
          vaccinationReminders(t, vaccination, animalsById.get(vaccination.animalId) ?? null, at),
        ),
        ...treatmentRows.flatMap((treatment) =>
          treatmentReminders(t, treatment, animalsById.get(treatment.animalId) ?? null, at),
        ),
      ])
    } catch (cause) {
      console.warn('Rappels non reconstruits :', cause)
    }
  }
}

/** Reconstruit tous les rappels depuis la base ; ne lève jamais et ne fait rien sans permission. */
export const syncAllReminders = createRemindersSync({
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  treatments: getTreatmentsRepository,
  notifications: reminderNotifications,
  t: i18n.global.t,
  now: () => new Date(),
})

/** Rattrape une permission accordée depuis les réglages et reconstruit après une restauration. */
export function installRemindersSync(sync: () => Promise<void> = syncAllReminders): () => void {
  void sync()
  return onAppResume(() => void sync())
}
