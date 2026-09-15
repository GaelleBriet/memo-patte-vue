import type { RouteLocationRaw } from 'vue-router'

import { shouldShowPriming } from '@/core/notifications/permission'

export type ReminderKind = 'vaccination' | 'treatment'

export async function routeAfterReminderSaved(saved: {
  hasDueDate: boolean
  animalName: string | null
  kind: ReminderKind
}): Promise<RouteLocationRaw> {
  if (saved.hasDueDate && (await shouldShowPriming())) {
    return {
      name: 'notifications-priming',
      query: saved.animalName
        ? { animalName: saved.animalName, kind: saved.kind }
        : { kind: saved.kind },
    }
  }
  return { name: 'animals' }
}
