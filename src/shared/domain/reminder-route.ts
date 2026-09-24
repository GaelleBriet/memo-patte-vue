import type { ReminderKind } from './reminders'

/** Rappel dont la feuille se rouvre au retour sur l'accueil, après « Modifier ». */
export const REMINDER_QUERY_PARAM = 'reminder'

export type ReminderRef = { kind: ReminderKind; id: string }

export function reminderQueryValue({ kind, id }: ReminderRef): string {
  return `${kind}:${id}`
}

export function parseReminderQuery(value: unknown): ReminderRef | null {
  if (typeof value !== 'string') return null
  const [kind, id, ...rest] = value.split(':')
  if (rest.length > 0 || !id) return null
  if (kind !== 'vaccination' && kind !== 'treatment') return null
  return { kind, id }
}
