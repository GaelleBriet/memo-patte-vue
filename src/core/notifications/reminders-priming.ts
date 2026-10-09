import type { Router } from 'vue-router'

export type PromptNotificationsIfReminders = (router: Router, from: string) => Promise<boolean>

let prompt: PromptNotificationsIfReminders | null = null

/** Branché par `app/` au démarrage : la lecture du carnet vit dans les features. */
export function provideRemindersPriming(next: PromptNotificationsIfReminders | null): void {
  prompt = next
}

/**
 * Remplace l'écran `from` par l'écran d'explication quand la permission n'a jamais été demandée et
 * que le carnet a une échéance à venir, sur appareil seulement. Sans effet si l'on a quitté `from` entre-temps ; ne lève jamais.
 * `false` tant que rien n'est branché.
 */
export function promptNotificationsIfReminders(router: Router, from: string): Promise<boolean> {
  return prompt === null ? Promise.resolve(false) : prompt(router, from)
}
