import { useI18n } from 'vue-i18n'

import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { useGuardedGestures } from '@/shared/composables/use-guarded-gestures'
import { showToast } from '@/shared/utils/toast'
import { DoseAlreadyLoggedError, type DoseAction } from '../logic/treatment-dose-writes'
import type { DoseActionTexts } from '../logic/treatment-gestures'
import { treatmentDeleteTexts } from '../logic/treatment-history'
import { stoppedText } from '../logic/treatment-stop'
import type { Treatment } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import type { DoseGesture } from '@/shared/domain/treatment-schedule'

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
  const { isBusy, guarded, undoable } = useGuardedGestures({ afterUndo: onChanged })

  function named(treatment: Named) {
    return { name: treatment.name, animal: animals.byId(treatment.animalId)?.name ?? '' }
  }

  async function stopped(treatment: Named, doses: readonly DoseGesture[]): Promise<void> {
    try {
      const result = await treatments.stop(treatment.id, doses)
      const message = stoppedText(t, treatment.name, result.finished)
      if (!result.stopped) showToast(message, { tone: 'info' })
      else {
        undoable(message, {
          ariaLabel: t('treatments.sheet.toast.undoStop', named(treatment)),
          undo: () => treatments.undoStop(treatment.id, result.undo),
        })
      }
    } finally {
      onChanged()
    }
  }

  function stop(treatment: Named, failed?: string): Promise<boolean> {
    return guarded(() => stopped(treatment, []), failed)
  }

  /** Doses renseignées puis arrêt, en un geste qu'un seul « Annuler » défait. */
  function stopLogging(
    treatment: Named,
    doses: readonly DoseGesture[],
  ): Promise<'done' | 'stale' | 'failed'> {
    return staleAware(() => stopped(treatment, doses), t('treatments.sheet.errors.stop'))
  }

  async function applied(
    treatment: Named,
    action: DoseAction,
    texts: DoseActionTexts,
  ): Promise<void> {
    try {
      const change = await treatments.applyDoseAction(treatment.id, action)
      if (change.alreadyGivenOn !== null) {
        showToast(texts.already(change.alreadyGivenOn), { tone: 'info' })
      } else if (change.undo.length > 0) {
        undoable(texts.done(change), {
          ariaLabel: texts.undo,
          undo: () => treatments.undoDoseAction(treatment.id, change.undo),
        })
      }
    } finally {
      onChanged()
    }
  }

  function applyDose(
    treatment: Named,
    action: DoseAction,
    texts: DoseActionTexts,
  ): Promise<boolean> {
    return guarded(() => applied(treatment, action, texts), t('treatments.detail.errors.change'))
  }

  /** `stale` : une dose était déjà notée, la liste montrée est périmée. */
  async function staleAware(
    action: () => Promise<void>,
    failed: string,
  ): Promise<'done' | 'stale' | 'failed'> {
    let stale = false
    const done = await guarded(async () => {
      try {
        await action()
      } catch (cause) {
        stale = cause instanceof DoseAlreadyLoggedError
        throw cause
      }
    }, failed)
    if (done) return 'done'
    return stale ? 'stale' : 'failed'
  }

  /** Lot de doses à renseigner. */
  function logDoses(
    treatment: Named,
    action: DoseAction,
    texts: DoseActionTexts,
  ): Promise<'done' | 'stale' | 'failed'> {
    return staleAware(() => applied(treatment, action, texts), t('treatments.detail.errors.change'))
  }

  /** Confirmée par un dialogue avant d'arriver ici ; « Annuler » rétablit ce que ce geste a supprimé. */
  function removeTreatment(treatment: Named): Promise<boolean> {
    const texts = treatmentDeleteTexts(t, treatment.name)
    return guarded(async () => {
      const deletedAt = await treatments.remove(treatment.id)
      undoable(texts.deleted, {
        ariaLabel: texts.undo,
        undo: () => treatments.undoRemove(treatment.id, deletedAt),
        announcement: texts.deletedLabel,
      })
    }, texts.failed)
  }

  return { isBusy, stop, stopLogging, applyDose, logDoses, removeTreatment }
}
