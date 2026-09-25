import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'

import type { ReminderKind } from './reminders'

/** Rappel de l'écran d'origine : sa feuille se rouvre sur l'accueil, son détail se retrouve sur le Carnet. */
export const REMINDER_QUERY_PARAM = 'reminder'

export const DETAIL_ROUTES: Readonly<Record<ReminderKind, string>> = {
  vaccination: 'vaccination-detail',
  treatment: 'treatment-detail',
}

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

export function detailRoute({ kind, id }: ReminderRef): RouteLocationRaw {
  return { name: DETAIL_ROUTES[kind], params: { id } }
}

/** Le détail que désignent une origine et son rappel, `null` si ce n'en est pas un. */
export function detailOrigin(from: unknown, reminder: unknown): ReminderRef | null {
  const ref = parseReminderQuery(reminder)
  return ref !== null && DETAIL_ROUTES[ref.kind] === from ? ref : null
}

/** L'écran courant comme origine d'un écran poussé : son nom, et son rappel s'il est un détail. */
export function originQuery(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'params'>): {
  from: string
  reminder?: string
} {
  const from = String(route.name ?? '')
  const id = route.params.id
  const kind = (Object.keys(DETAIL_ROUTES) as ReminderKind[]).find(
    (candidate) => DETAIL_ROUTES[candidate] === from,
  )
  return kind && typeof id === 'string'
    ? { from, reminder: reminderQueryValue({ kind, id }) }
    : { from }
}
