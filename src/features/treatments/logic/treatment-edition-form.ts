import type { z } from 'zod'

import { editionDraft, treatmentEditionSchemaFor, type EditionDraft } from './treatment-edition'
import {
  emptyTreatmentFormValues,
  rhythmInput,
  rhythmOfValues,
  treatmentFormValuesFrom,
  type TreatmentFormValues,
} from './treatment-form-values'
import { treatmentFormErrorsOf, type TreatmentFormErrors } from './treatment-form-errors'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { PastDuesChoice } from '../schema/treatment-form.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'

export type TreatmentEditionResult =
  | { success: true; data: z.output<ReturnType<typeof treatmentEditionSchemaFor>> }
  | { success: false; errors: TreatmentFormErrors; needsPastDuesChoice: boolean }

/** Ce que « Modifier » ferait de la saisie en cours ; lève quand l'historique est illisible. */
export function editionDraftOf(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
): EditionDraft {
  const chosenOn = values.nextDoseOn.trim()
  return editionDraft(
    history,
    rhythmOfValues(values),
    today,
    isCalendarDay(chosenOn) ? chosenOn : null,
    values.shiftsFollowing,
  )
}

/**
 * « Prochaine dose » n'est envoyée que si elle est proposée : vide, elle est alors refusée. Avec une
 * réponse `pastDues`, la date envoyée est celle que la question a annoncée pour ce choix.
 * `needsPastDuesChoice` : la saisie est valide, il reste à poser la question des échéances tombées.
 */
export function validateTreatmentEdition(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
  pastDues: PastDuesChoice | null = null,
): TreatmentEditionResult {
  const { nextDose, pastDuesNextDose } = editionDraftOf(values, history, today)
  const typed = values.nextDoseOn.trim()
  const announcedOn = pastDues === null ? null : (pastDuesNextDose?.[pastDues] ?? null)
  const result = treatmentEditionSchemaFor(history, today).safeParse({
    name: values.name,
    type: values.type,
    ...rhythmInput(values),
    nextDoseOn: announcedOn ?? (nextDose === null ? null : typed),
    ...(values.shiftsFollowing ? {} : { shiftsFollowing: false }),
    ...(pastDues === null ? {} : { pastDues }),
  })
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    errors: treatmentFormErrorsOf(result.error.issues),
    needsPastDuesChoice: result.error.issues.every(({ path }) => path[0] === 'pastDues'),
  }
}

/** Les valeurs d'un traitement relu : ses réglages en cours et la prochaine dose proposée. */
export function editedFormValues(loaded: TreatmentWithHistory, today: string): TreatmentFormValues {
  const first = editionDraftOf(emptyTreatmentFormValues(), loaded, today)
  return {
    ...treatmentFormValuesFrom(loaded, first.period),
    nextDoseOn: first.nextDose?.proposedOn ?? '',
    shiftsFollowing: first.nextDose?.shiftInitial ?? true,
  }
}
