import { resolve } from './treatment-edition-change'
import { farthestMoveOf, type FarthestMove } from './treatment-edition-checks'
import type { EditionResolution, PastDuesNextDose } from './treatment-edition-resolution'
import { treatmentReadingOf } from './treatment-reading-adapter'
import type { TreatmentRhythm } from '../schema/treatment-form.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { Due } from '@/shared/domain/dose-calendar'

export type EditionDraft = Pick<EditionResolution, 'period' | 'change' | 'nextDose'> & {
  /** La date de fin ne passe pas avant son arrivée. */
  farthestMove: FarthestMove | null
  /** Échéances tombées que le nouveau rythme laisserait à renseigner ou retirerait : la question est à poser. */
  pastDues: Due[]
  /** La première échéance que chaque réponse écrirait ; `null` sans question à poser. */
  pastDuesNextDose: PastDuesNextDose | null
}

/**
 * Ce que « Modifier » ferait des réglages saisis, et la « Prochaine dose » à proposer, avec son
 * aide pour la date `chosenOn` saisie. `rhythm` vaut `null` tant que la saisie n'est pas valide :
 * les réglages enregistrés servent alors. Lève une `RangeError` quand l'historique est illisible.
 */
export function editionDraft(
  treatment: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  today: string,
  chosenOn: string | null = null,
  shiftsFollowing = true,
): EditionDraft {
  const { period, change, nextDose, pastDues, pastDuesNextDose } = resolve(
    treatment,
    rhythm,
    { chosenOn, shiftsFollowing },
    today,
  )
  const farthestMove =
    change === 'locked'
      ? null
      : farthestMoveOf(treatmentReadingOf(treatment, today).view, period.id)
  return { period, change, nextDose, farthestMove, pastDues, pastDuesNextDose }
}
