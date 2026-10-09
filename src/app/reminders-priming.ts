import type { Router } from 'vue-router'

import {
  provideRemindersPriming,
  type PromptNotificationsIfReminders,
} from '@/core/notifications/reminders-priming'
import { remindersPriming } from '@/features/treatments/service/reminders-priming.service'

export function installLaunchPriming(
  router: Router,
  prompt: PromptNotificationsIfReminders = remindersPriming,
): void {
  void router.isReady().then(
    () => prompt(router, 'home'),
    () => false,
  )
}

/** Confie à `core/` la lecture du carnet que l'accueil et Mes données demandent. Renvoie le débranchement. */
export function installRemindersPriming(
  prompt: PromptNotificationsIfReminders = remindersPriming,
): () => void {
  provideRemindersPriming(prompt)
  return () => provideRemindersPriming(null)
}
