import type { z } from 'zod'

import { creationPastDues, treatmentCreationSchemaFor } from './treatment-creation'
import { rhythmInput, type TreatmentFormValues } from './treatment-form-values'
import { treatmentFormResultOf, type TreatmentFormResult } from './treatment-form-errors'
import type { PastDose } from '../schema/treatment-form.schema'
import type { Due } from '@/shared/domain/treatment-schedule'

export type TreatmentCreationResult = TreatmentFormResult<
  z.output<ReturnType<typeof treatmentCreationSchemaFor>>
>

/** `pastDoses` : la réponse de l'encart des doses passées, `null` s'il n'est pas rempli. */
export function validateTreatmentCreation(
  values: TreatmentFormValues,
  animalId: string,
  today: string,
  pastDoses: PastDose[] | null = null,
): TreatmentCreationResult {
  return treatmentFormResultOf(
    treatmentCreationSchemaFor(today).safeParse({
      animalId,
      name: values.name,
      type: values.type,
      firstDoseOn: values.firstDoseOn.trim(),
      ...rhythmInput(values),
      ...(pastDoses === null ? {} : { pastDoses }),
    }),
  )
}

/** Échéances passées que l'encart de création annonce (TR-3), d'après la saisie en cours. */
export function creationPastDuesOf(values: TreatmentFormValues, today: string): Due[] {
  const { frequency, times, endsOn } = rhythmInput(values)
  return creationPastDues(
    { firstDoseOn: values.firstDoseOn.trim(), frequency, times, endsOn },
    today,
  )
}

/** Ce dont dépend une réponse de l'encart : changé, la réponse ne vaut plus (TR-3). */
export function pastDosesBasis(values: TreatmentFormValues, dues: readonly Due[]): string {
  const { firstDoseOn, frequencyValue, frequencyUnit, times, endsOn } = values
  return JSON.stringify([firstDoseOn, frequencyValue, frequencyUnit, times, endsOn, dues.length])
}
