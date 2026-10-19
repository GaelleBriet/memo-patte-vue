import { lineAction } from './treatment-line-actions'
import type { DoseLineAction, DoseRow, RowContext } from './treatment-history-rows'
import { play } from '@/shared/domain/dose-calendar'

/**
 * Les choix du menu ⋮ d'une ligne : chaque note proposée est rejouée par le moteur, qui ne garde que
 * celles qu'il accepte. À lire à l'ouverture du menu : rejouer chaque ligne de l'historique coûte trop.
 */
export function menuOf(
  { reading, today }: RowContext,
  { dose, actions }: DoseRow,
): DoseLineAction[] {
  return actions.filter((choice) => {
    const action = lineAction(dose, choice, today)
    return action?.kind !== 'note' || !('refusal' in play(reading.input, action.gesture))
  })
}
