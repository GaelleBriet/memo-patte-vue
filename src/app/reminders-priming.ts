import type { Router } from 'vue-router'

import type { PromptNotificationsIfReminders } from '@/core/notifications/reminders-priming'
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
