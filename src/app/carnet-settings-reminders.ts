import { syncAllReminders } from '@/app/reminders-sync'
import { useCarnetSettingsStore } from '@/features/settings/store/carnet-settings.store'

/** Reprogramme tous les rappels après chaque réglage du carnet enregistré. Pinia doit être actif. */
export function installCarnetSettingsReminders(
  sync: () => Promise<void> = syncAllReminders,
): () => void {
  return useCarnetSettingsStore().$onAction(({ name, after }) => {
    if (name === 'update') after(() => void sync())
  })
}
