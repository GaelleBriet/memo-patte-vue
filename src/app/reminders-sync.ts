import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { onNotificationPermissionGranted } from '@/core/notifications'
import {
  provideCarnetReminderSettings,
  provideFullReminderSync,
} from '@/core/notifications/due-reminders-schedule'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { getCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { syncAllReminders } from '@/features/treatments/service/reminders-sync.service'
import type { CarnetReminderSettings } from '@/shared/domain/reminder-plan'

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
