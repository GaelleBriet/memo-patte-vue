import type { Router } from 'vue-router'

import type { ReminderAction } from '@/core/notifications'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'
import { doseActionTexts, hasSeveralTimes } from '../logic/treatment-gestures'
import { notificationTarget } from '../logic/treatment-notification'
import { readableScheduleOf } from '../logic/treatment-schedule-adapter'
import type { TreatmentsRepository } from '../repository/treatments.repository'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { AppliedDoseChange, TreatmentDosesService } from './treatment-doses.service'
import type { VaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { confirmUndoable } from '@/shared/composables/use-guarded-gestures'
import { isLegacyReminderKey, parseReminderKey } from '@/shared/domain/due-reminders'
import {
  parseReminderQuery,
  reminderSheetQuery,
  type NotifiedDue,
  type ReminderRequest,
} from '@/shared/domain/reminder-route'
import type { Due } from '@/shared/domain/treatment-schedule'
import { isInjectionNoted } from '@/shared/domain/vaccination-reminders'
import { formatDayMonthOrYear } from '@/shared/utils/format'
import { showToast } from '@/shared/utils/toast'
import type { Translate } from '@/core/i18n/translate'

type Provider<T> = () => T | Promise<T>

export type ReminderActionsDependencies = {
  router: Pick<Router, 'currentRoute' | 'push' | 'replace'>
  animals: Provider<Pick<AnimalsRepository, 'getById'>>
  treatments: Provider<Pick<TreatmentsRepository, 'getWithHistory'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'getById' | 'listReplacedDues'>>
  doses: Pick<TreatmentDosesService, 'apply' | 'noteMoment' | 'undoBatch'>
  refreshHome: () => unknown
  t: Translate
  today: () => string
}

type Done = { animalId: string; name: string; doneOn: string }

type Named = { name: string; animal: string }

type AlreadyNotedTexts = {
  today: (named: Named) => string
  on: (named: Named & { date: string }) => string
}

/**
 * Traite une action de notification : l'app s'ouvre toujours sur l'accueil. « C'est fait » note
 * l'échéance du jour d'un traitement, demande « Donnée quand ? » pour un jour passé, ouvre la feuille
 * « Fait » d'un vaccin, dit « déjà noté » pour une échéance notée entre-temps, et ouvre la feuille
 * dans le doute ; toucher la notification ouvre la feuille du rappel.
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
    texts: AlreadyNotedTexts,
    { animalId, name, doneOn }: Done,
  ): Promise<void> {
    await openHome()
    const named = { name, animal: await animalName(animalId) }
    const day = today()
    const message =
      doneOn === day
        ? texts.today(named)
        : texts.on({ ...named, date: formatDayMonthOrYear(doneOn, day) })
    showToast(message, { tone: 'info' })
  }

  const ALREADY_DOSE: AlreadyNotedTexts = {
    today: (named) => t('notifications.action.alreadyDoseToday', named),
    on: (named) => t('notifications.action.alreadyDose', named),
  }

  function doseAlreadyNoted(treatment: TreatmentWithHistory, doneOn: string): Promise<void> {
    return alreadyNoted(ALREADY_DOSE, {
      animalId: treatment.animalId,
      name: treatment.name,
      doneOn,
    })
  }

  async function noDoseLeft(): Promise<void> {
    await openHome()
    showToast(t('treatments.sheet.errors.noDoseLeft'), { tone: 'info' })
  }

  async function confirmNoted(
    treatment: TreatmentWithHistory,
    due: Due,
    givenOn: string,
    noted: AppliedDoseChange,
  ): Promise<void> {
    void refreshHome()
    const named = { name: treatment.name, animal: await animalName(treatment.animalId) }
    const texts = doseActionTexts(
      t,
      { ...named, today: today(), severalTimes: hasSeveralTimes(treatment, due.periodId) },
      { kind: 'note', gesture: { kind: 'given', due, givenOn } },
      null,
    )
    confirmUndoable(t, texts.done(noted), {
      ariaLabel: texts.undo,
      undo: () => doses.undoBatch(treatment.id, noted.undo),
      onUndone: () => void refreshHome(),
      onFailed: () => void refreshHome(),
    })
  }

  async function noteToday(treatment: TreatmentWithHistory, due: Due): Promise<void> {
    const { id } = treatment
    await openHome()
    const givenOn = today()
    const noted = await doses
      .apply(id, { kind: 'note', gesture: { kind: 'given', due, givenOn } })
      .catch(() => null)
    if (noted === null) {
      showToast(t('treatments.sheet.errors.dose'), { tone: 'error' })
      return openHome({ kind: 'treatment', id, step: 'actions' })
    }
    if (noted.alreadyGivenOn !== null) return doseAlreadyNoted(treatment, noted.alreadyGivenOn)
    return confirmNoted(treatment, due, givenOn, noted)
  }

  /** Notification du jour à la clé sans heure, d'avant les rappels par heure : le geste d'avant (Q32). */
  async function legacyDone(treatment: TreatmentWithHistory, dueDate: string): Promise<void> {
    const { id } = treatment
    const sheet: ReminderRequest = { kind: 'treatment', id, step: 'actions' }
    await openHome()
    const givenOn = today()
    const noted = await doses.noteMoment(id, givenOn, { notifiedDueOn: dueDate }).catch(() => null)
    if (noted === null) {
      showToast(t('treatments.sheet.errors.dose'), { tone: 'error' })
      return openHome(sheet)
    }
    if (noted.outcome === 'ask') return openHome(sheet)
    if (noted.outcome === 'none') {
      showToast(t('treatments.sheet.errors.noDoseLeft'), { tone: 'info' })
      return
    }
    if (noted.outcome === 'day-noted') {
      showToast(t('treatments.sheet.toast.dayNoted'), { tone: 'info' })
      return
    }
    if (noted.due === null) return doseAlreadyNoted(treatment, noted.alreadyGivenOn ?? givenOn)
    return confirmNoted(treatment, noted.due, givenOn, noted)
  }

  async function treatmentDone(id: string, notified: NotifiedDue, legacy: boolean): Promise<void> {
    const treatment = await (await treatments()).getWithHistory(id)
    if (treatment === null) return openHome()
    const day = today()
    const schedule = readableScheduleOf(treatment, day)
    if (schedule === null) return openHome({ kind: 'treatment', id, step: 'actions' })
    if (legacy && notified.dueOn === day) return legacyDone(treatment, notified.dueOn)

    const target = notificationTarget(schedule, notified, day)
    switch (target.kind) {
      case 'none':
        return noDoseLeft()
      case 'already':
        return doseAlreadyNoted(treatment, target.givenOn)
      case 'sheet':
        return openHome({ kind: 'treatment', id, step: 'actions' })
      case 'given-when':
        return openHome({ kind: 'treatment', id, step: 'given-when', due: notified })
      case 'note':
        return noteToday(treatment, target.due)
    }
  }

  async function vaccinationDone(id: string, dueDate: string): Promise<void> {
    const repository = await vaccinations()
    const vaccination = await repository.getById(id)
    if (vaccination === null) return openHome()
    const { lastInjectionDate } = vaccination
    const replacedDues = await repository.listReplacedDues(id)
    if (lastInjectionDate !== null && isInjectionNoted({ ...vaccination, replacedDues }, dueDate)) {
      const texts: AlreadyNotedTexts = {
        today: (named) => t('notifications.action.alreadyInjectionToday', named),
        on: (named) => t('notifications.action.alreadyInjection', named),
      }
      return alreadyNoted(texts, {
        animalId: vaccination.animalId,
        name: vaccination.name,
        doneOn: lastInjectionDate,
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
    // La relance d'un jour à plusieurs heures vise toute la journée (RA-5).
    const dueTime = parsed.moment === 'overdue' ? null : parsed.dueTime
    return treatmentDone(reminder.id, { dueOn: parsed.dueDate, dueTime }, isLegacyReminderKey(key))
  }
}
