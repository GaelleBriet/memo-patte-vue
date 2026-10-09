import type { RouteLocationRaw, Router } from 'vue-router'

import { shouldShowPriming } from './permission'
import {
  PRIMING_ROUTE,
  primingReturnRoute,
  reminderQuery,
  type ReminderKind,
} from '@/shared/domain/notification-priming'
import { ANIMAL_NAME_QUERY_PARAM } from '@/shared/utils/animal-name-query-param'
import { returnToOr } from '@/shared/utils/return-to'

export type SavedReminder = {
  hasDueDate: boolean
  animalName: string | null
  kind: ReminderKind
  /** Écran où revenir : `home`, `settings`, `settings-reminders`, `settings-data`, `carnet` ou un détail du Carnet, le Carnet sinon. */
  from?: string
  /** Rappel dont la feuille se rouvre au retour (`reminder-route.ts`). */
  reminder?: string
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

/** Quitte le formulaire d'un rappel enregistré, sans jamais lever : un échec retombe sur l'écran d'origine. */
export async function leaveAfterReminderSaved(router: Router, saved: SavedReminder): Promise<void> {
  const safe = primingReturnRoute(saved.from, saved.reminder)
  const target = await routeAfterReminderSaved(saved).catch(() => safe)
  await returnToOr(router, target, safe)
}
