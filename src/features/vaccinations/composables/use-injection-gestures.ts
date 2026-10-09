import { useI18n } from 'vue-i18n'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { useGuardedGestures } from '@/shared/composables/use-guarded-gestures'
import {
  injectionGestureTexts,
  pastInjectionToast,
  vaccinationDeleteTexts,
  VaccinationWithoutReminderError,
} from '../logic/vaccination-history'
import type { InjectionDates } from '../schema/vaccination-injection.schema'
import type { RecordedInjection } from '../service/vaccination-injections.service'
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
  const { isBusy, guarded, undoable } = useGuardedGestures({ afterUndo: onChanged })

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
        undoable(texts.removed, {
          ariaLabel: texts.undoRemove,
          undo: () => store.undoRemoveInjection(vaccinationId, id, removed),
        })
      } catch (cause) {
        if (!(cause instanceof VaccinationWithoutReminderError)) throw cause
        outcome = 'without-reminder'
      }
    }, t('vaccinations.detail.errors.change'))
    return ok ? outcome : 'failed'
  }

  function added(
    vaccinationId: string,
    injectedOn: string,
    write: () => Promise<RecordedInjection>,
  ): Promise<boolean> {
    const toast = pastInjectionToast(t, injectedOn, todayIsoDate())
    return guarded(async () => {
      const { injectionId } = await write()
      onChanged()
      undoable(toast.added, {
        ariaLabel: toast.undoAdd,
        undo: () => store.undoInjection(vaccinationId, injectionId),
      })
    }, t('vaccinations.detail.past.failed'))
  }

  function addPastInjection(
    vaccination: Pick<Vaccination, 'id'>,
    injectedOn: string,
  ): Promise<boolean> {
    return added(vaccination.id, injectedOn, () =>
      store.addPastInjection(vaccination.id, injectedOn),
    )
  }

  /** Injection passée qui a demandé le rappel suivant : les deux s'écrivent ensemble. */
  function addPastInjectionWithReminder(
    vaccination: Pick<Vaccination, 'id'>,
    dates: InjectionDates,
  ): Promise<boolean> {
    return added(vaccination.id, dates.injectedOn, () =>
      store.addPastInjectionWithReminder(vaccination.id, dates),
    )
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
      undoable(texts.moved(injectedOn), {
        ariaLabel: texts.undoMove,
        undo: () => store.undoChangeInjectionDate(vaccinationId, id, previous),
      })
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
      undoable(texts.deleted, {
        ariaLabel: texts.undo,
        undo: () => store.undoRemove(vaccination.id, deletedAt),
      })
    }, texts.failed)
  }

  return {
    isBusy,
    removeInjection,
    addPastInjection,
    addPastInjectionWithReminder,
    changeInjectionDate,
    changeInjectionDateAndReminder,
    removeVaccination,
  }
}
