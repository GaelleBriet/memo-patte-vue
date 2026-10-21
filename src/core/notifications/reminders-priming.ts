import type { Router } from 'vue-router'

import type { PrimingOptions } from '@/shared/domain/notification-priming'

export type PromptNotificationsIfReminders = (
  router: Router,
  from: string,
  options?: PrimingOptions,
) => Promise<boolean>

let prompt: PromptNotificationsIfReminders | null = null

/** Branché au démarrage par `installRemindersPriming` (`app/`) : la lecture du carnet vit dans les features. */
export function provideRemindersPriming(next: PromptNotificationsIfReminders | null): void {
  prompt = next
}

/**
 * L'écran d'explication à la place de `from` si le carnet a une échéance et que rien n'a été demandé.
 * Ne lève jamais ; `false` tant que rien n'est branché.
 */
export function promptNotificationsIfReminders(
  ...args: Parameters<PromptNotificationsIfReminders>
): Promise<boolean> {
  return prompt === null ? Promise.resolve(false) : prompt(...args)
}
