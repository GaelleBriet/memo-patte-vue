import { readonly, ref, type Ref } from 'vue'

import { useAppResume } from '@/core/app-lifecycle/app-resume'
import {
  getExactRemindersStatus,
  openExactRemindersSettings,
  type ExactRemindersStatus,
} from './exact-reminders'

/**
 * État des rappels précis, relu au montage et à chaque retour au premier plan. `null` avant la
 * première lecture. `openSettings` ouvre l'écran Android « Alarmes et rappels » : seulement après
 * l'écran d'explication.
 */
export function useExactReminders(): {
  status: Readonly<Ref<ExactRemindersStatus | null>>
  refresh: () => Promise<void>
  openSettings: () => Promise<void>
} {
  const status = ref<ExactRemindersStatus | null>(null)

  async function refresh(): Promise<void> {
    status.value = await getExactRemindersStatus()
  }

  async function openSettings(): Promise<void> {
    status.value = await openExactRemindersSettings()
  }

  void refresh()
  useAppResume(() => void refresh())

  return { status: readonly(status), refresh, openSettings }
}
