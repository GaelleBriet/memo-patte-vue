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
 * « Restaurer mon carnet » s'ouvre de lui-même une fois par jour local tant que la sauvegarde
 * attend « Fusionner » ou « Remplacer », et de nouveau quand un choix est reproposé. La première
 * proposition s'ouvre dès que la sauvegarde est trouvée sur l'accueil sans feuille, ni affichée ni
 * dans l'adresse ; ensuite, seule une arrivée sur l'accueil sans feuille l'ouvre.
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
    if (onRestore && (!choiceRan || step === 'choice')) shownOn = today
    if (shownOn === today || step !== 'choice' || !current.onHome) return false
    if (current.sheetShown()) return false
    if ((navigation !== null || choiceRan || shownOn !== null) && !navigation?.arrived) return false
    shownOn = today
    return true
  }

  return { shouldOpen }
}
