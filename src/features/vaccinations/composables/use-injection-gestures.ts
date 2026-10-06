import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { showToast, showUndoableToast } from '@/shared/utils/toast'
import {
  injectionGestureTexts,
  pastInjectionToast,
  vaccinationDeleteTexts,
  VaccinationWithoutReminderError,
} from '../logic/vaccination-history'
import type { InjectionDates } from '../repository/vaccination-injections.repository'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'
import { useVaccinationsStore } from '../store/vaccinations.store'

/**
 * Gestes de l'historique d'un vaccin, chacun confirmé par un toast ; `onChanged` relit l'écran
 * après le geste et après son annulation. Chaque geste rend faux s'il a échoué, l'échec dit.
 */
export function useInjectionGestures(onChanged: () => void) {
  const { t } = useI18n()
  const store = useVaccinationsStore()
  const isBusy = ref(false)

  async function guarded(action: () => Promise<void>, failed: string): Promise<boolean> {
    if (isBusy.value) return false
    isBusy.value = true
    try {
      await action()
      return true
    } catch {
      showToast(failed, { tone: 'error' })
      return false
    } finally {
      isBusy.value = false
    }
  }

  function undoable(message: string, ariaLabel: string, undo: () => Promise<unknown>): void {
    showUndoableToast(message, {
      label: t('reminderSheet.undo'),
      ariaLabel,
      undo,
      onUndone: onChanged,
      failedMessage: t('reminderSheet.undoFailed'),
    })
  }

  /** `without-reminder` : seule injection d'un vaccin sans rappel, c'est le vaccin à supprimer. */
  async function removeInjection(
    injection: VaccinationInjection,
  ): Promise<'done' | 'failed' | 'without-reminder'> {
    const { vaccinationId, id } = injection
    const texts = injectionGestureTexts(t, injection.injectedOn, todayIsoDate())
    let outcome: 'done' | 'without-reminder' = 'done'
    const ok = await guarded(async () => {
      try {
        const removed = await store.removeInjection(vaccinationId, id)
        onChanged()
        undoable(texts.removed, texts.undoRemove, () =>
          store.undoRemoveInjection(vaccinationId, id, removed),
        )
      } catch (cause) {
        if (!(cause instanceof VaccinationWithoutReminderError)) throw cause
        outcome = 'without-reminder'
      }
    }, t('vaccinations.detail.errors.change'))
    return ok ? outcome : 'failed'
  }

  function addPastInjection(
    vaccination: Pick<Vaccination, 'id' | 'name'>,
    injectedOn: string,
  ): Promise<boolean> {
    const toast = pastInjectionToast(t, injectedOn, todayIsoDate())
    return guarded(async () => {
      const { injectionId } = await store.addPastInjection(vaccination.id, injectedOn)
      onChanged()
      undoable(toast.added, toast.undoAdd, () => store.undoInjection(vaccination.id, injectionId))
    }, t('vaccinations.detail.past.failed'))
  }

  function moved(
    injection: VaccinationInjection,
    injectedOn: string,
    write: () => Promise<InjectionDates>,
  ): Promise<boolean> {
    const { vaccinationId, id } = injection
    const texts = injectionGestureTexts(t, injection.injectedOn, todayIsoDate())
    return guarded(async () => {
      const previous = await write()
      onChanged()
      undoable(texts.moved(injectedOn), texts.undoMove, () =>
        store.undoChangeInjectionDate(vaccinationId, id, previous),
      )
    }, t('vaccinations.detail.errors.change'))
  }

  function changeInjectionDate(
    injection: VaccinationInjection,
    injectedOn: string,
  ): Promise<boolean> {
    return moved(injection, injectedOn, () =>
      store.changeInjectionDate(injection.vaccinationId, injection.id, injectedOn),
    )
  }

  /** Déplacement qui a redemandé le prochain rappel : les deux s'écrivent ensemble. */
  function changeInjectionDateAndReminder(
    injection: VaccinationInjection,
    dates: InjectionDates,
  ): Promise<boolean> {
    return moved(injection, dates.injectedOn, () =>
      store.changeInjectionDateAndReminder(injection.vaccinationId, injection.id, dates),
    )
  }

  /** Confirmée par un dialogue avant d'arriver ici ; « Annuler » rétablit ce que ce geste a supprimé. */
  function removeVaccination(vaccination: Vaccination): Promise<boolean> {
    const texts = vaccinationDeleteTexts(t, vaccination.name, { onlyInjection: false })
    return guarded(async () => {
      const deletedAt = await store.remove(vaccination.id)
      undoable(texts.deleted, texts.undo, () => store.undoRemove(vaccination.id, deletedAt))
    }, texts.failed)
  }

  return {
    isBusy,
    removeInjection,
    addPastInjection,
    changeInjectionDate,
    changeInjectionDateAndReminder,
    removeVaccination,
  }
}
