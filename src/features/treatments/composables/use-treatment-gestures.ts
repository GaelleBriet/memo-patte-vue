import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { showToast, showUndoableToast } from '@/shared/utils/toast'
import type { DoseAction } from '../logic/treatment-dose-writes'
import type { DoseActionTexts } from '../logic/treatment-gestures'
import { treatmentDeleteTexts } from '../logic/treatment-history'
import { doseToast } from '../logic/treatment-sheet'
import type { Treatment } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'

type Named = Pick<Treatment, 'id' | 'name' | 'animalId'>

/**
 * Gestes sur un traitement et ses prises, chacun confirmé par un toast ; `onChanged` relit l'écran
 * après le geste et après son annulation. Chaque geste rend faux s'il a échoué ; `failed`, quand
 * il est donné, dit l'échec en toast.
 */
export function useTreatmentGestures(onChanged: () => void) {
  const { t } = useI18n()
  const treatments = useTreatmentsStore()
  const animals = useAnimalsStore()
  const isBusy = ref(false)

  function named(treatment: Named) {
    return { name: treatment.name, animal: animals.byId(treatment.animalId)?.name ?? '' }
  }

  async function guarded(action: () => Promise<void>, failed?: string): Promise<boolean> {
    if (isBusy.value) return false
    isBusy.value = true
    try {
      await action()
      return true
    } catch {
      if (failed) showToast(failed, { tone: 'error' })
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

  function recordDose(treatment: Named, givenOn: string, failed?: string): Promise<boolean> {
    return guarded(async () => {
      const { doseId } = await treatments.recordDose(treatment.id, givenOn)
      onChanged()
      const message = doseToast(t, { ...named(treatment), givenOn, today: todayIsoDate() })
      if (doseId === null) showToast(message)
      else {
        undoable(message, t('treatments.sheet.toast.undoDose', named(treatment)), () =>
          treatments.undoDose(treatment.id, doseId),
        )
      }
    }, failed)
  }

  function stop(treatment: Named, failed?: string): Promise<boolean> {
    return guarded(async () => {
      const { stopped } = await treatments.stop(treatment.id)
      onChanged()
      const message = t('treatments.sheet.toast.stopped', named(treatment))
      if (!stopped) showToast(message)
      else {
        undoable(message, t('treatments.sheet.toast.undoStop', named(treatment)), () =>
          treatments.undoStop(treatment.id),
        )
      }
    }, failed)
  }

  function applyDose(
    treatment: Named,
    action: DoseAction,
    texts: DoseActionTexts,
  ): Promise<boolean> {
    return guarded(async () => {
      try {
        const applied = await treatments.applyDoseAction(treatment.id, action)
        if (applied.alreadyGivenOn !== null) {
          showToast(texts.already(applied.alreadyGivenOn), { tone: 'info' })
        } else if (applied.undo.length > 0) {
          undoable(texts.done(applied), texts.undo, () =>
            treatments.undoDoseAction(treatment.id, applied.undo),
          )
        }
      } finally {
        onChanged()
      }
    }, t('treatments.detail.errors.change'))
  }

  /** Suppression définitive, confirmée par un dialogue avant d'arriver ici. */
  function removeTreatment(treatment: Named): Promise<boolean> {
    const texts = treatmentDeleteTexts(t, treatment.name)
    return guarded(async () => {
      await treatments.remove(treatment.id)
      showToast(texts.deleted)
    }, texts.failed)
  }

  return { isBusy, recordDose, stop, applyDose, removeTreatment }
}
