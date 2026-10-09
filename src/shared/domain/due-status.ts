import type { ReminderStatus } from './reminders'

/**
 * `none` est le style neutre : « Pas de rappel », et badge de fréquence des traitements ;
 * `to-log` : « À renseigner », jamais un retard.
 */
export type DueStatus = ReminderStatus | 'up-to-date' | 'none' | 'to-log' | 'planned'
