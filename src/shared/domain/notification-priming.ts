import type { RouteLocationRaw } from 'vue-router'

import { ANIMAL_NAME_QUERY_PARAM } from '@/shared/utils/animal-name-query-param'
import { shouldShowPriming } from '@/core/notifications/permission'
import { detailOrigin, detailRoute, REMINDER_QUERY_PARAM } from './reminder-route'

export type ReminderKind = 'vaccination' | 'treatment'

const PRIMING_ROUTE = 'notifications-priming'
const DEFAULT_RETURN_ROUTE = 'animals'
const RETURN_ROUTES: readonly string[] = ['home', 'settings', 'animals']

export type SavedReminder = {
  hasDueDate: boolean
  animalName: string | null
  kind: ReminderKind
  /** Écran où revenir : `home`, `settings`, `animals` ou un détail du Carnet, le Carnet sinon. */
  from?: string
  /** Rappel dont la feuille se rouvre au retour (`reminder-route.ts`). */
  reminder?: string
}

function reminderQuery(reminder: unknown): Record<string, string> {
  return typeof reminder === 'string' ? { [REMINDER_QUERY_PARAM]: reminder } : {}
}

/** L'écran d'explication, quand le rappel posé est le premier et que rien n'a été demandé ; sinon `null`. */
export async function primingAfterReminderSaved(
  saved: SavedReminder,
): Promise<RouteLocationRaw | null> {
  if (!saved.hasDueDate || !(await shouldShowPriming())) return null
  return {
    name: PRIMING_ROUTE,
    query: {
      ...(saved.animalName ? { [ANIMAL_NAME_QUERY_PARAM]: saved.animalName } : {}),
      kind: saved.kind,
      ...(saved.from ? { from: saved.from } : {}),
      ...reminderQuery(saved.reminder),
    },
  }
}

export async function routeAfterReminderSaved(saved: SavedReminder): Promise<RouteLocationRaw> {
  return (await primingAfterReminderSaved(saved)) ?? primingReturnRoute(saved.from, saved.reminder)
}

/** `from` : `home`, `settings` ou `animals`, où l'écran d'explication ramènera. */
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
