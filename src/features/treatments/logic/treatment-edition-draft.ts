import { farthestMoveOf, resolve, type FarthestMove } from './treatment-edition-change'
import type { EditionResolution } from './treatment-edition-resolution'
import type { PastDuesChoice, TreatmentRhythm } from '../schema/treatment-form.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { Due } from '@/shared/domain/treatment-schedule'

export type EditionDraft = Pick<EditionResolution, 'period' | 'change' | 'nextDose'> & {
  /** La date de fin ne passe pas avant son arrivée. */
  farthestMove: FarthestMove | null
  /** Échéances tombées que le nouveau rythme laisserait à renseigner ou retirerait : la question est à poser. */
  pastDues: Due[]
  /** La première échéance que chaque réponse écrirait ; `null` sans question à poser. */
  pastDuesNextDose: Record<PastDuesChoice, string> | null
}

/**
 * Ce que « Modifier » ferait des réglages saisis : correction ou nouvelle période, et la
 * « Prochaine dose » à proposer, avec son aide pour la date `chosenOn` saisie. `rhythm` vaut `null`
 * tant que la saisie n'est pas valide : les réglages enregistrés servent alors. Lève une
 * `RangeError` quand l'historique est illisible.
 */
export function editionDraft(
  history: TreatmentWithHistory,
  rhythm: TreatmentRhythm | null,
  today: string,
  chosenOn: string | null = null,
  shiftsFollowing = true,
): EditionDraft {
  const { period, change, nextDose, pastDues } = resolve(
    history,
    rhythm,
    { chosenOn, shiftsFollowing },
    today,
  )
  const farthestMove = change === 'locked' ? null : farthestMoveOf(history, period.id, today, null)
  const touchedOn = chosenOn !== nextDose?.proposedOn ? chosenOn : null
  // Aucune date n'est écrite sans avoir été vue : la date saisie quand elle vaut pour ce chemin, sinon celle qu'il calcule.
  const nextDoseFor = (choice: PastDuesChoice): string => {
    const answered = resolve(
      history,
      rhythm,
      { chosenOn: null, shiftsFollowing },
      today,
      choice,
    ).nextDose
    if (answered === null) return touchedOn ?? today
    const fits =
      touchedOn !== null &&
      touchedOn >= answered.earliest &&
      (answered.latest === null || touchedOn <= answered.latest)
    return fits ? touchedOn : answered.proposedOn
  }
  return {
    period,
    change,
    nextDose,
    farthestMove,
    pastDues,
    pastDuesNextDose:
      pastDues.length === 0 ? null : { keep: nextDoseFor('keep'), drop: nextDoseFor('drop') },
  }
}
