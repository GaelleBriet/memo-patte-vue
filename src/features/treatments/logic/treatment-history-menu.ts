import { lineAction } from './treatment-line-actions'
import { refusalText } from './treatment-refusal-texts'
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
export function menuOf(t: Translate, context: RowContext, row: DoseRow): MenuChoice[] {
  return row.actions.flatMap((action): MenuChoice[] => {
    const known = row.refused?.[action]
    if (known !== undefined) return [{ action, hint: known }]
    const gesture = lineAction(row.dose, action, context.today)
    if (gesture?.kind === 'note') {
      return 'refusal' in play(context.reading.input, gesture.gesture) ? [] : [{ action }]
    }
    if (action !== 'remove') return [{ action }]
    const refusal = removalRefusal(context.reading.input, row.dose.id)
    return [
      refusal === null ? { action } : { action, hint: refusalText(t, refusal, context.today) },
    ]
  })
}
