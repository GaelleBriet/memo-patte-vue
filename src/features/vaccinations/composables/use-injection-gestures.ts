import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { showToast, showUndoableToast } from '@/shared/utils/toast'
import { injectionGestureTexts, vaccinationDeleteTexts } from '../logic/vaccination-history'
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

  function removeInjection(injection: VaccinationInjection): Promise<boolean> {
    const { vaccinationId, id } = injection
    const texts = injectionGestureTexts(t, injection.injectedOn, todayIsoDate())
    return guarded(async () => {
      await store.removeInjection(vaccinationId, id)
      onChanged()
      undoable(texts.removed, texts.undoRemove, () => store.undoRemoveInjection(vaccinationId, id))
    }, t('vaccinations.detail.errors.change'))
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

  /** Suppression définitive, confirmée par un dialogue avant d'arriver ici. */
  function removeVaccination(vaccination: Vaccination): Promise<boolean> {
    const texts = vaccinationDeleteTexts(t, vaccination.name, { onlyInjection: false })
    return guarded(async () => {
      await store.remove(vaccination.id)
      showToast(texts.deleted)
    }, texts.failed)
  }

  return {
    isBusy,
    removeInjection,
    changeInjectionDate,
    changeInjectionDateAndReminder,
    removeVaccination,
  }
}
