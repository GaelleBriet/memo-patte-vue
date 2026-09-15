import type { RouteLocationRaw, Router } from 'vue-router'

import { shouldShowPriming } from '@/core/notifications/permission'

export type ReminderKind = 'vaccination' | 'treatment'

const PRIMING_ROUTE = 'notifications-priming'
const DEFAULT_RETURN_ROUTE = 'animals'

export async function routeAfterReminderSaved(saved: {
  hasDueDate: boolean
  animalName: string | null
  kind: ReminderKind
}): Promise<RouteLocationRaw> {
  if (saved.hasDueDate && (await shouldShowPriming())) {
    return {
      name: PRIMING_ROUTE,
      query: saved.animalName
        ? { animalName: saved.animalName, kind: saved.kind }
        : { kind: saved.kind },
    }
  }
  return { name: DEFAULT_RETURN_ROUTE }
}

/** `from` : nom d'une route sans paramètre, où l'écran d'explication ramènera. */
export function primingRouteFrom(from: string): RouteLocationRaw {
  return { name: PRIMING_ROUTE, query: { from } }
}

export function primingReturnRoute(
  from: unknown,
  router: Pick<Router, 'hasRoute'>,
): RouteLocationRaw {
  if (typeof from === 'string' && from !== PRIMING_ROUTE && router.hasRoute(from)) {
    return { name: from }
  }
  return { name: DEFAULT_RETURN_ROUTE }
}
