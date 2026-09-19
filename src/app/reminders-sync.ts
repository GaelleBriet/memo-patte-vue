import { onAppResume } from '@/core/app-lifecycle/app-resume'
import i18n from '@/core/i18n'
import {
  onNotificationPermissionGranted,
  type Reminder,
  type ScheduledReminder,
} from '@/core/notifications'
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
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  pendingTime,
  provideFullReminderSync,
  reminderNotifications,
  remindersWithinCap,
  type ReminderNotifications,
} from '@/shared/due-reminders-schedule'

type Provider<T> = () => T | Promise<T>

/** Une ligne dont les rappels ne se calculent pas ne doit pas priver l'appareil de tous les autres. */
function remindersOf<T extends { id: string }>(
  label: string,
  rows: T[],
  build: (row: T) => Reminder[],
): Reminder[] {
  const reminders: Reminder[] = []
  for (const row of rows) {
    try {
      reminders.push(...build(row))
    } catch (cause) {
      console.warn(`Rappels du ${label} ignorés :`, row.id, cause)
    }
  }
  return reminders
}

function fingerprint(key: string | undefined, time: number | null, title: string, body: string) {
  return JSON.stringify([key, time, title, body])
}

function isAlreadyScheduled(pending: ScheduledReminder[], wanted: Reminder[]): boolean {
  if (pending.length !== wanted.length) return false
  const scheduled = new Set(
    pending.map((reminder) =>
      fingerprint(reminder.key, pendingTime(reminder), reminder.title, reminder.body),
    ),
  )
  return wanted.every(({ key, at, title, body }) =>
    scheduled.has(fingerprint(key, at.getTime(), title, body)),
  )
}

export type RemindersSyncDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listAll'>>
  notifications: Pick<ReminderNotifications, 'checkPermission' | 'rescheduleAll' | 'listScheduled'>
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
      if (!(await notifications.checkPermission())) {
        await notifications.rescheduleAll([])
        return
      }

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
        ...remindersOf('vaccin', vaccinationRows, (vaccination) =>
          vaccinationReminders(t, vaccination, animalsById.get(vaccination.animalId) ?? null, at),
        ),
        ...remindersOf('traitement', treatmentRows, (treatment) =>
          treatmentReminders(t, treatment, animalsById.get(treatment.animalId) ?? null, at),
        ),
      ]

      const wanted = remindersWithinCap(reminders, MAX_SCHEDULED_REMINDERS)
      if (isAlreadyScheduled(await notifications.listScheduled(), wanted)) return
      await notifications.rescheduleAll(wanted)
    } catch (cause) {
      console.warn('Rappels non reconstruits :', cause)
    }
  }
}

/** Reconstruit tous les rappels depuis la base ; ne lève jamais, et annule tout sans permission. */
export const syncAllReminders = createRemindersSync({
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  treatments: getTreatmentsRepository,
  notifications: reminderNotifications,
  t: i18n.global.t,
  now: () => new Date(),
})

/**
 * Synchronise dès que la permission est accordée, reconstruit après une restauration,
 * remplit la fenêtre de rappels et reprend le prénom d'un animal modifié. Pinia doit être actif.
 */
export function installRemindersSync(
  sync: () => Promise<void> = syncAllReminders,
  onPermissionGranted: typeof onNotificationPermissionGranted = onNotificationPermissionGranted,
): () => void {
  provideFullReminderSync(sync)
  void sync()
  const stopResume = onAppResume(() => void sync())
  const stopGranted = onPermissionGranted(() => void sync())
  const stopAnimalUpdates = useAnimalsStore().$onAction(({ name, after }) => {
    if (name === 'update') after(() => void sync())
  })
  return () => {
    provideFullReminderSync(null)
    stopResume()
    stopGranted()
    stopAnimalUpdates()
  }
}
