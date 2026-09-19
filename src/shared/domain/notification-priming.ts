import type { RouteLocationRaw } from 'vue-router'

import { ANIMAL_NAME_QUERY_PARAM } from '@/shared/utils/animal-name-query-param'
import { shouldShowPriming } from '@/core/notifications/permission'

export type ReminderKind = 'vaccination' | 'treatment'

const PRIMING_ROUTE = 'notifications-priming'
const DEFAULT_RETURN_ROUTE = 'animals'
const RETURN_ROUTES: readonly string[] = ['home', 'settings', 'animals']

export async function routeAfterReminderSaved(saved: {
  hasDueDate: boolean
  animalName: string | null
  kind: ReminderKind
}): Promise<RouteLocationRaw> {
  if (saved.hasDueDate && (await shouldShowPriming())) {
    return {
      name: PRIMING_ROUTE,
      query: saved.animalName
        ? { [ANIMAL_NAME_QUERY_PARAM]: saved.animalName, kind: saved.kind }
        : { kind: saved.kind },
    }
  }
  return { name: DEFAULT_RETURN_ROUTE }
}

/** `from` : `home`, `settings` ou `animals`, où l'écran d'explication ramènera. */
export function primingRouteFrom(from: string): RouteLocationRaw {
  return { name: PRIMING_ROUTE, query: { from } }
}

export function primingReturnRoute(from: unknown): RouteLocationRaw {
  return {
    name: typeof from === 'string' && RETURN_ROUTES.includes(from) ? from : DEFAULT_RETURN_ROUTE,
  }
}
