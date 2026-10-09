import type { z } from 'zod'

import { resumptionDraft, treatmentResumptionSchemaFor } from './treatment-resumption'
import {
  rhythmInput,
  treatmentFormValuesFrom,
  type TreatmentFormValues,
} from './treatment-form-values'
import { treatmentFormResultOf, type TreatmentFormResult } from './treatment-form-errors'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

export type TreatmentResumptionResult = TreatmentFormResult<
  z.output<ReturnType<typeof treatmentResumptionSchemaFor>>
>

export function validateTreatmentResumption(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
): TreatmentResumptionResult {
  return treatmentFormResultOf(
    treatmentResumptionSchemaFor(history, today).safeParse({
      firstDoseOn: values.firstDoseOn.trim(),
      ...rhythmInput(values),
    }),
  )
}

type ResumedTreatmentForm =
  { status: 'ready'; values: TreatmentFormValues } | { status: 'not-resumable' }

/** Les valeurs d'un traitement relu ; un traitement ni terminé ni arrêté n'a rien à reprendre : retour à sa fiche. */
export function resumedFormValues(
  loaded: TreatmentWithHistory,
  today: string,
): ResumedTreatmentForm {
  const { period, canResume } = resumptionDraft(loaded, today)
  if (!canResume) return { status: 'not-resumable' }
  return { status: 'ready', values: { ...treatmentFormValuesFrom(loaded, period), endsOn: '' } }
}

/** Une reprise ne s'enregistre qu'avec sa première prise. */
export function canSubmitResumption(values: Pick<TreatmentFormValues, 'firstDoseOn'>): boolean {
  return values.firstDoseOn !== ''
}
