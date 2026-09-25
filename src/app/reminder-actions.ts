import type { Router } from 'vue-router'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import i18n from '@/core/i18n'
import { onReminderAction, type ReminderAction } from '@/core/notifications'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import { useHomeStore } from '@/features/home/store/home.store'
import { isDoseNoted, isTreatmentDueDate } from '@/features/treatments/logic/treatment-reminders'
import { doseToast } from '@/features/treatments/logic/treatment-sheet'
import { isOngoing } from '@/features/treatments/logic/treatment-status'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import {
  treatmentDosesService,
  type TreatmentDosesService,
} from '@/features/treatments/service/treatment-doses.service'
import { isInjectionNoted } from '@/features/vaccinations/logic/vaccination-reminders'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import { parseReminderKey } from '@/shared/domain/due-reminders'
import {
  parseReminderQuery,
  reminderSheetQuery,
  type ReminderRequest,
} from '@/shared/domain/reminder-route'
import { formatDayMonthOrYear } from '@/shared/utils/format'
import { showToast, showUndoableToast } from '@/shared/utils/toast'

type Provider<T> = () => T | Promise<T>

type Translate = (key: string, named?: Record<string, unknown>) => string

export type ReminderActionsDependencies = {
  router: Pick<Router, 'currentRoute' | 'push' | 'replace'>
  animals: Provider<Pick<AnimalsRepository, 'getById'>>
  treatments: Provider<Pick<TreatmentsRepository, 'getById'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'getById'>>
  doses: Pick<TreatmentDosesService, 'record' | 'undo'>
  refreshHome: () => unknown
  t: Translate
  today: () => string
}

type Done = { animalId: string; name: string; doneOn: string }

type Named = { name: string; animal: string; date: string }

/**
 * Traite une action de notification : l'app s'ouvre toujours sur l'accueil. « C'est fait » note la
 * prise du jour d'un traitement dont l'échéance tient encore, ouvre la feuille « Fait » d'un vaccin,
 * dit « déjà noté » pour une échéance notée entre-temps, et ouvre la feuille dans le doute ; toucher
 * la notification ouvre la feuille du rappel.
 */
export function createReminderActions({
  router,
  animals,
  treatments,
  vaccinations,
  doses,
  refreshHome,
  t,
  today,
}: ReminderActionsDependencies): (action: ReminderAction) => Promise<void> {
  async function openHome(request?: ReminderRequest): Promise<void> {
    const location = { name: 'home', query: request ? reminderSheetQuery(request) : {} }
    if (router.currentRoute.value.name === 'home') await router.replace(location)
    else await router.push(location)
  }

  async function animalName(animalId: string): Promise<string> {
    return (await (await animals()).getById(animalId))?.name ?? ''
  }

  async function alreadyNoted(
    message: (named: Named) => string,
    { animalId, name, doneOn }: Done,
  ): Promise<void> {
    await openHome()
    const date = formatDayMonthOrYear(doneOn, today())
    showToast(message({ name, animal: await animalName(animalId), date }), { tone: 'info' })
  }

  async function treatmentDone(id: string, dueDate: string): Promise<void> {
    const treatment = await (await treatments()).getById(id)
    if (treatment === null || !isOngoing(treatment)) return openHome()
    const sheet: ReminderRequest = { kind: 'treatment', id, step: 'actions' }
    if (isDoseNoted(treatment, dueDate)) {
      return alreadyNoted((named) => t('notifications.action.alreadyDose', named), {
        animalId: treatment.animalId,
        name: treatment.name,
        doneOn: treatment.lastDoseDate,
      })
    }
    if (!isTreatmentDueDate(treatment, dueDate)) return openHome(sheet)

    await openHome()
    const givenOn = today()
    const recorded = await doses.record(id, givenOn).catch(() => null)
    if (recorded === null) {
      showToast(t('treatments.sheet.errors.dose'), { tone: 'error' })
      return openHome(sheet)
    }
    void refreshHome()
    const named = { name: treatment.name, animal: await animalName(treatment.animalId) }
    const message = doseToast(t, { ...named, givenOn, today: givenOn })
    const { doseId } = recorded
    if (doseId === null) {
      showToast(message)
      return
    }
    showUndoableToast(message, {
      label: t('reminderSheet.undo'),
      ariaLabel: t('treatments.sheet.toast.undoDose', named),
      undo: () => doses.undo(id, doseId),
      onUndone: () => void refreshHome(),
      failedMessage: t('reminderSheet.undoFailed'),
    })
  }

  async function vaccinationDone(id: string, dueDate: string): Promise<void> {
    const vaccination = await (await vaccinations()).getById(id)
    if (vaccination === null) return openHome()
    if (isInjectionNoted(vaccination, dueDate)) {
      return alreadyNoted((named) => t('notifications.action.alreadyInjection', named), {
        animalId: vaccination.animalId,
        name: vaccination.name,
        doneOn: vaccination.lastInjectionDate,
      })
    }
    return openHome({ kind: 'vaccination', id, step: 'done' })
  }

  return async ({ key, action }) => {
    const parsed = parseReminderKey(key)
    const reminder = parsed === null ? null : parseReminderQuery(parsed.entry)
    if (parsed === null || reminder === null) return openHome()
    if (action === 'open') return openHome({ ...reminder, step: 'actions' })
    if (reminder.kind === 'vaccination') return vaccinationDone(reminder.id, parsed.dueDate)
    return treatmentDone(reminder.id, parsed.dueDate)
  }
}

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
