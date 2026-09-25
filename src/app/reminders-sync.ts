import { onAppResume } from '@/core/app-lifecycle/app-resume'
import i18n from '@/core/i18n'
import {
  onNotificationPermissionGranted,
  type Reminder,
  type ScheduledReminder,
} from '@/core/notifications'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { isDoseNoted, treatmentReminders } from '@/features/treatments/logic/treatment-reminders'
import type { Treatment } from '@/features/treatments/schema/treatment.schema'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import {
  isInjectionNoted,
  vaccinationReminders,
} from '@/features/vaccinations/logic/vaccination-reminders'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import { dueReminderEntryKey, type Translate } from '@/shared/domain/due-reminders'
import {
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  notedDeliveredIds,
  pendingTime,
  provideFullReminderSync,
  reminderNotifications,
  remindersWithinCap,
  type ReminderNotifications,
} from '@/shared/domain/due-reminders-schedule'

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

/** Le bouton en fait partie : un rappel posé sans lui avant la mise à jour est refait. */
function fingerprint(
  {
    key,
    title,
    body,
    actionTypeId,
  }: Pick<ScheduledReminder, 'key' | 'title' | 'body' | 'actionTypeId'>,
  time: number | null,
) {
  return JSON.stringify([key, time, title, body, actionTypeId ?? null])
}

function isAlreadyScheduled(pending: ScheduledReminder[], wanted: Reminder[]): boolean {
  if (pending.length !== wanted.length) return false
  const scheduled = new Set(pending.map((reminder) => fingerprint(reminder, pendingTime(reminder))))
  return wanted.every((reminder) => scheduled.has(fingerprint(reminder, reminder.at.getTime())))
}

function notedDue(
  vaccinations: Vaccination[],
  treatments: Treatment[],
): (entry: string, dueDate: string) => boolean {
  const entryOf = (kind: 'vaccination' | 'treatment', id: string) =>
    dueReminderEntryKey({ kind, id })
  const vaccinationsByEntry = new Map(
    vaccinations.map((row) => [entryOf('vaccination', row.id), row]),
  )
  const treatmentsByEntry = new Map(treatments.map((row) => [entryOf('treatment', row.id), row]))
  return (entry, dueDate) => {
    const vaccination = vaccinationsByEntry.get(entry)
    if (vaccination) return isInjectionNoted(vaccination, dueDate)
    const treatment = treatmentsByEntry.get(entry)
    return treatment !== undefined && isDoseNoted(treatment, dueDate)
  }
}

export type RemindersSyncDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listAll'>>
  notifications: Pick<
    ReminderNotifications,
    'checkPermission' | 'rescheduleAll' | 'listScheduled' | 'removeDelivered'
  >
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

      const scheduled = await notifications.listScheduled()
      const noted = notedDeliveredIds(
        scheduled,
        notedDue(vaccinationRows, treatmentRows),
        at.getTime(),
      )
      if (noted.length > 0) {
        await notifications
          .removeDelivered(noted)
          .catch((cause: unknown) => console.warn('Volet des notifications non vidé :', cause))
      }

      const wanted = remindersWithinCap(reminders, MAX_SCHEDULED_REMINDERS)
      const kept = scheduled.filter(({ id }) => !noted.includes(id))
      if (isAlreadyScheduled(kept, wanted)) return
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
