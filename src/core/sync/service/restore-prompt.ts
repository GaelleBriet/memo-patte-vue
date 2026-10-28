import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import type { RestoreFlowState } from '@/core/sync/service/restore-flow'

export interface RestorePromptScreen {
  onRestore: boolean
  onHome: boolean
  sheetShown: () => boolean
}

export interface RestorePromptNavigation {
  arrived: boolean
  leftRestore: boolean
}

/**
 * Dit si « Restaurer mon carnet » doit s'ouvrir : une fois par jour local tant que la sauvegarde
 * attend un choix, et de nouveau quand un choix est reproposé, sur l'accueil sans feuille.
 */
export function createRestorePrompt() {
  let shownOn: string | null = null
  let choiceRan = false

  function shouldOpen(
    step: RestoreFlowState['step'] | undefined,
    screen: () => RestorePromptScreen,
    navigation: RestorePromptNavigation | null,
  ): boolean {
    if (step === undefined || step === 'idle') {
      shownOn = null
      choiceRan = false
      return false
    }
    if (step === 'restoring') {
      shownOn = null
      choiceRan = true
      return false
    }
    const today = todayIsoDate()
    const current = screen()
    const onRestore = current.onRestore || navigation?.leftRestore === true
    const awaitsAnswer = step === 'choice' || step === 'send-confirmation'
    if (onRestore && (!choiceRan || awaitsAnswer)) shownOn = today
    if (shownOn === today || !awaitsAnswer || !current.onHome) return false
    if (current.sheetShown()) return false
    if ((navigation !== null || choiceRan || shownOn !== null) && !navigation?.arrived) return false
    shownOn = today
    return true
  }

  return { shouldOpen }
}
