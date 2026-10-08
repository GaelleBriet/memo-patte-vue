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
import {
  getCarnetSettingsRepository,
  type CarnetSettingsRepository,
} from '@/features/settings/repository/carnet-settings.repository'
import { treatmentReminders } from '@/features/treatments/logic/treatment-reminders'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import { vaccinationReminders } from '@/features/vaccinations/logic/vaccination-reminders'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import { dueReminderEntryKey } from '@/shared/domain/due-reminders'
import {
  enqueueReminderTask,
  MAX_SCHEDULED_REMINDERS,
  notedDeliveredIds,
  pendingTime,
  provideCarnetReminderSettings,
  provideFullReminderSync,
  reminderNotifications,
  isRebuildRequested,
  markRebuilt,
  withOneRetry,
  type EntryReminders,
  type ReminderNotifications,
} from '@/shared/domain/due-reminders-schedule'
import { plannedReminders, type CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import type { ReminderKind } from '@/shared/domain/reminders'
import type { Translate } from '@/core/i18n/translate'

type Provider<T> = () => T | Promise<T>

/** Une ligne dont les rappels ne se calculent pas ne doit pas priver l'appareil de tous les autres. */
function remindersOf<T extends { id: string }>(
  kind: ReminderKind,
  label: string,
  rows: T[],
  build: (row: T) => EntryReminders,
): [string, EntryReminders][] {
  return rows.flatMap((row): [string, EntryReminders][] => {
    try {
      return [[dueReminderEntryKey({ kind, id: row.id }), build(row)]]
    } catch (cause) {
      console.warn(`Rappels du ${label} ignorés :`, row.id, cause)
      return []
    }
  })
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

function isAlreadyScheduled(
  pending: ScheduledReminder[],
  wanted: Reminder[],
  exact: boolean,
): boolean {
  if (pending.length !== wanted.length) return false
  if (pending.some((reminder) => reminder.exact !== exact)) return false
  const scheduled = new Set(pending.map((reminder) => fingerprint(reminder, pendingTime(reminder))))
  return wanted.every((reminder) => scheduled.has(fingerprint(reminder, reminder.at.getTime())))
}

export type RemindersSyncDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll' | 'listAllReplacedDues'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listAllWithHistory'>>
  carnetSettings: Provider<Pick<CarnetSettingsRepository, 'get'>>
  notifications: Pick<
    ReminderNotifications,
    'checkPermission' | 'canScheduleExact' | 'rescheduleAll' | 'listScheduled' | 'removeDelivered'
  >
  t: Translate
  now: () => Date
}

export function createRemindersSync({
  animals,
  vaccinations,
  treatments,
  carnetSettings,
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

      const [animalsRepository, vaccinationsRepository, treatmentsRepository, settingsRepository] =
        await Promise.all([animals(), vaccinations(), treatments(), carnetSettings()])
      const [animalRows, vaccinationRows, replacedDues, treatmentRows, settings] =
        await Promise.all([
          animalsRepository.list(),
          vaccinationsRepository.listAll(),
          vaccinationsRepository.listAllReplacedDues(),
          treatmentsRepository.listAllWithHistory(),
          settingsRepository.get(),
        ])
      const animalsById = new Map(animalRows.map((animal) => [animal.id, animal]))
      const animalOf = (id: string) => animalsById.get(id) ?? null
      const at = now()

      const entries = new Map([
        ...remindersOf('vaccination', 'vaccin', vaccinationRows, (vaccination) =>
          vaccinationReminders(
            t,
            { ...vaccination, replacedDues: replacedDues.get(vaccination.id) ?? [] },
            animalOf(vaccination.animalId),
            settings,
            at,
          ),
        ),
        ...remindersOf('treatment', 'traitement', treatmentRows, (treatment) =>
          treatmentReminders(t, treatment, animalOf(treatment.animalId), settings, at),
        ),
      ])
      const cares = [...entries.values()].flatMap(({ care }) => (care === null ? [] : [care]))

      const scheduled = await notifications.listScheduled()
      const noted = notedDeliveredIds(
        scheduled,
        (entry, dueDate, dueTime) => entries.get(entry)?.isNoted(dueDate, dueTime) ?? false,
        at.getTime(),
      )
      if (noted.length > 0) {
        await notifications
          .removeDelivered(noted)
          .catch((cause: unknown) => console.warn('Volet des notifications non vidé :', cause))
      }

      const wanted = plannedReminders(cares, MAX_SCHEDULED_REMINDERS)
      const kept = scheduled.filter(({ id }) => !noted.includes(id))
      const exact = await notifications.canScheduleExact()
      if (!isRebuildRequested() && isAlreadyScheduled(kept, wanted, exact)) return
      if (await withOneRetry(() => notifications.rescheduleAll(wanted))) markRebuilt()
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
  carnetSettings: getCarnetSettingsRepository,
  notifications: reminderNotifications,
  t: i18n.global.t,
  now: () => new Date(),
})

async function readCarnetSettings(): Promise<CarnetReminderSettings> {
  return (await getCarnetSettingsRepository()).get()
}

/**
 * Synchronise dès que la permission est accordée, reconstruit après une restauration et à chaque
 * retour au premier plan, reprend le prénom d'un animal modifié, et donne les réglages du carnet
 * aux rappels d'un soin. Pinia doit être actif.
 */
export function installRemindersSync(
  sync: () => Promise<void> = syncAllReminders,
  onPermissionGranted: typeof onNotificationPermissionGranted = onNotificationPermissionGranted,
  settings: () => Promise<CarnetReminderSettings> = readCarnetSettings,
): () => void {
  provideFullReminderSync(sync)
  provideCarnetReminderSettings(settings)
  void sync()
  const stopResume = onAppResume(() => void sync())
  const stopGranted = onPermissionGranted(() => void sync())
  const stopAnimalUpdates = useAnimalsStore().$onAction(({ name, after }) => {
    if (name === 'update') after(() => void sync())
  })
  return () => {
    provideFullReminderSync(null)
    provideCarnetReminderSettings(null)
    stopResume()
    stopGranted()
    stopAnimalUpdates()
  }
}
