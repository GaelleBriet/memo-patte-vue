import { onAppResume } from '@/core/app-lifecycle/app-resume'
import i18n from '@/core/i18n'
import { reminderNotificationId, type Reminder } from '@/core/notifications'
import { getAnimalsRepository, type AnimalsRepository } from '@/features/animals/animals.repository'
import { useAnimalsStore } from '@/features/animals/animals.store'
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
import {
  earliestReminders,
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  reminderNotifications,
  type ReminderNotifications,
} from '@/shared/due-reminders-schedule'

type Provider<T> = () => T | Promise<T>

function warnOnIdCollisions(reminders: Reminder[]): void {
  const keysById = new Map<number, string>()
  for (const { key } of reminders) {
    const id = reminderNotificationId(key)
    const other = keysById.get(id)
    if (other !== undefined) {
      console.warn('Rappels : identifiant de notification en double', `${other} / ${key}`)
    }
    keysById.set(id, key)
  }
}

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
  return () => enqueueReminderTask(syncAllReminders)

  async function syncAllReminders(): Promise<void> {
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

      const reminders = [
        ...vaccinationRows.flatMap((vaccination) =>
          vaccinationReminders(t, vaccination, animalsById.get(vaccination.animalId) ?? null, at),
        ),
        ...treatmentRows.flatMap((treatment) =>
          treatmentReminders(t, treatment, animalsById.get(treatment.animalId) ?? null, at),
        ),
      ]
      warnOnIdCollisions(reminders)

      await notifications.rescheduleAll(earliestReminders(reminders, MAX_SCHEDULED_REMINDERS))
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

/**
 * Rattrape une permission accordée depuis les réglages, reconstruit après une restauration,
 * remplit la fenêtre de rappels et reprend le prénom d'un animal modifié. Pinia doit être actif.
 */
export function installRemindersSync(sync: () => Promise<void> = syncAllReminders): () => void {
  void sync()
  const stopResume = onAppResume(() => void sync())
  const stopAnimalUpdates = useAnimalsStore().$onAction(({ name, after }) => {
    if (name === 'update') after(() => void sync())
  })
  return () => {
    stopResume()
    stopAnimalUpdates()
  }
}
