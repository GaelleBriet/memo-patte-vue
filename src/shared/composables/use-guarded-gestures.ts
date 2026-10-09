import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Translate } from '@/core/i18n/translate'
import { showToast, showUndoableToast, type UndoOptions } from '@/shared/utils/toast'

export type UndoableGesture = Pick<
  UndoOptions,
  'ariaLabel' | 'undo' | 'onFailed' | 'onExpired' | 'announcement'
> & { onUndone?: () => void }

/** Toast « Annuler » d'un geste réversible, avec le libellé et le message d'échec communs. */
export function confirmUndoable(t: Translate, message: string, gesture: UndoableGesture): void {
  showUndoableToast(message, {
    label: t('reminderSheet.undo'),
    failedMessage: t('reminderSheet.undoFailed'),
    ...gesture,
    onUndone: gesture.onUndone ?? (() => {}),
  })
}

/**
 * Un geste à la fois, chacun confirmé par un toast « Annuler » ; `afterUndo`, quand il est donné,
 * relit l'écran après l'annulation, qu'elle ait abouti ou non.
 */
export function useGuardedGestures({ afterUndo }: { afterUndo?: () => void } = {}) {
  const { t } = useI18n()
  const isBusy = ref(false)

  /** Rend faux sans rien lancer si un geste est en cours ; une erreur de `action` remonte. */
  async function oneAtATime<T>(action: () => Promise<T>): Promise<T | false> {
    if (isBusy.value) return false
    isBusy.value = true
    try {
      return await action()
    } finally {
      isBusy.value = false
    }
  }

  /** Vrai si le geste a abouti ; `failed`, quand il est donné, dit l'échec en toast. */
  async function guarded(action: () => Promise<void>, failed?: string): Promise<boolean> {
    return oneAtATime(async () => {
      try {
        await action()
        return true
      } catch {
        if (failed) showToast(failed, { tone: 'error' })
        return false
      }
    })
  }

  function undoable(message: string, gesture: UndoableGesture): void {
    confirmUndoable(t, message, { onUndone: afterUndo, onFailed: afterUndo, ...gesture })
  }

  return { isBusy, oneAtATime, guarded, undoable }
}
