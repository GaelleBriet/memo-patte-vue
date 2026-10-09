import type { RouteLocationRaw } from 'vue-router'

import { detailOrigin, detailRoute, REMINDER_QUERY_PARAM } from './reminder-route'

export type ReminderKind = 'vaccination' | 'treatment'

export const PRIMING_ROUTE = 'notifications-priming'
const DEFAULT_RETURN_ROUTE = 'carnet'
const RETURN_ROUTES: readonly string[] = [
  'home',
  'settings',
  'settings-reminders',
  'settings-data',
  'carnet',
]

export function reminderQuery(reminder: unknown): Record<string, string> {
  return typeof reminder === 'string' ? { [REMINDER_QUERY_PARAM]: reminder } : {}
}

/** `from` : `home`, `settings`, `settings-reminders` ou `animals`, où l'écran d'explication ramènera. */
export function primingRouteFrom(from: string): RouteLocationRaw {
  return { name: PRIMING_ROUTE, query: { from } }
}

export function primingReturnRoute(from: unknown, reminder?: unknown): RouteLocationRaw {
  const detail = detailOrigin(from, reminder)
  if (detail) return detailRoute(detail)
  const name =
    typeof from === 'string' && RETURN_ROUTES.includes(from) ? from : DEFAULT_RETURN_ROUTE
  const query = reminderQuery(reminder)
  return Object.keys(query).length > 0 ? { name, query } : { name }
}
