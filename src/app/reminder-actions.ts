import type { Router } from 'vue-router'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import i18n from '@/core/i18n'
import { onReminderAction, type ReminderAction } from '@/core/notifications'
import { getAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { useHomeStore } from '@/features/home/store/home.store'
import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import {
  createReminderActions,
  type ReminderActionsDependencies,
} from '@/features/treatments/service/reminder-actions.service'
import { treatmentDosesService } from '@/features/treatments/service/treatment-doses.service'
import { getVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'

/** Branché sur la base locale et l'accueil ; Pinia doit être actif à la première action. */
export function reminderActions(
  router: ReminderActionsDependencies['router'],
): (action: ReminderAction) => Promise<void> {
  return createReminderActions({
    router,
    animals: getAnimalsRepository,
    treatments: getTreatmentsRepository,
    vaccinations: getVaccinationsRepository,
    doses: treatmentDosesService,
    refreshHome: () => useHomeStore().load(),
    t: i18n.global.t,
    today: todayIsoDate,
  })
}

/**
 * Écoute les actions des notifications et les traite une à une, après la première navigation :
 * une action faite app fermée arrive avant elle. Renvoie la désinscription.
 */
export function installReminderActions(
  router: Pick<Router, 'isReady'>,
  handle: (action: ReminderAction) => Promise<void>,
  listen: typeof onReminderAction = onReminderAction,
): () => void {
  let queue: Promise<unknown> = Promise.resolve()
  return listen((action) => {
    queue = queue
      .then(() => router.isReady())
      .then(() => handle(action))
      .catch((cause: unknown) => console.warn('Action de notification non traitée :', cause))
  })
}
