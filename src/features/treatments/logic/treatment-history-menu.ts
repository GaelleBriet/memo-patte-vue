import { lineAction } from './treatment-line-actions'
import { refusalText, removeMoveRefusalText } from './treatment-refusal-texts'
import type { DoseLineAction, DoseRow, RowContext } from './treatment-history-rows'
import { play, removalRefusal } from '@/shared/domain/dose-calendar'
import type { Translate } from '@/core/i18n/translate'

/** `hint` : le choix est grisé, avec l'aide qui dit pourquoi. */
export type MenuChoice = { action: DoseLineAction; hint?: string }

/**
 * Les choix du menu ⋮ d'une ligne : chaque note proposée est rejouée par le moteur, qui ne garde que
 * celles qu'il accepte, et « Supprimer » qu'il refuse est grisé. À lire à l'ouverture du menu :
 * rejouer chaque ligne de l'historique coûte trop.
 */
export function menuOf(t: Translate, { reading, today }: RowContext, row: DoseRow): MenuChoice[] {
  return row.actions.flatMap((action): MenuChoice[] => {
    const gesture = lineAction(row.dose, action, today)
    if (gesture?.kind === 'note') {
      return 'refusal' in play(reading.input, gesture.gesture) ? [] : [{ action }]
    }
    if (gesture?.kind !== 'remove') return [{ action }]
    const refusal = removalRefusal(reading.input, row.dose.id)
    if (refusal === null) return [{ action }]
    const text = action === 'remove-move' ? removeMoveRefusalText : refusalText
    return [{ action, hint: text(t, refusal, today) }]
  })
}
