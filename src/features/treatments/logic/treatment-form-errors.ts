import type { z } from 'zod'

import type { EndsOnIssueReason, NextDoseOnIssueReason } from './treatment-edition-checks'
import { fieldErrorsOf, type FieldErrorKeys } from '@/shared/form/field-errors'

export const DUPLICATE_TIME_ERROR_KEY = 'treatments.form.errors.timesDuplicate'

export type TreatmentFormErrorField = keyof typeof ERROR_KEYS
export type TreatmentFormErrors = Partial<Record<TreatmentFormErrorField, string>>

const FIELD_OF_PATH: Record<string, TreatmentFormErrorField> = {
  name: 'name',
  type: 'type',
  frequency: 'frequency',
  firstDoseOn: 'firstDoseOn',
  nextDoseOn: 'nextDoseOn',
  times: 'times',
  doseQuantity: 'dosage',
  doseUnit: 'dosage',
  endsOn: 'endsOn',
}

const NEXT_DOSE_ON_REASON_KEYS: Record<NextDoseOnIssueReason, string> = {
  tooEarly: 'treatments.form.errors.nextDoseOnTooEarly',
  afterEnd: 'treatments.form.errors.nextDoseOnAfterEnd',
  afterNextDose: 'treatments.form.errors.nextDoseOnAfterNextDose',
  refused: 'treatments.form.errors.nextDoseOnRefused',
}

const ENDS_ON_REASON_KEYS: Record<EndsOnIssueReason, string> = {
  beforeFirstDose: 'treatments.form.errors.endsOnBeforeFirstDose',
  beforeNextDose: 'treatments.form.errors.endsOnBeforeNextDose',
  beforeLastDose: 'treatments.form.errors.endsOnBeforeLastDose',
  beforePostponedDose: 'treatments.form.errors.endsOnBeforePostponedDose',
  beforeAdvancedDose: 'treatments.form.errors.endsOnBeforeAdvancedDose',
  beforeFarPostponedDose: 'treatments.form.errors.endsOnBeforeFarPostponedDose',
  beforeFarAdvancedDose: 'treatments.form.errors.endsOnBeforeFarAdvancedDose',
}

/** Le motif d'un refus est porté par le message de l'erreur Zod. */
const ERROR_KEYS = {
  name: {
    key: 'treatments.form.errors.name',
    byCode: { too_big: 'treatments.form.errors.nameMax' },
  },
  type: { key: 'treatments.form.errors.type' },
  frequency: {
    key: 'treatments.form.errors.frequency',
    byCode: { too_big: 'treatments.form.errors.frequencyMax' },
  },
  firstDoseOn: {
    key: 'treatments.form.errors.firstDoseOn',
    byMessage: {
      tooEarly: 'treatments.form.errors.firstDoseOnTooEarly',
      tooOld: 'treatments.form.errors.firstDoseOnTooOld',
    },
  },
  nextDoseOn: { key: 'treatments.form.errors.nextDoseOn', byMessage: NEXT_DOSE_ON_REASON_KEYS },
  times: { key: 'treatments.form.errors.times' },
  dosage: {
    key: 'treatments.form.errors.dosageQuantity',
    byMessage: { incomplete: 'treatments.form.errors.dosageIncomplete' },
  },
  endsOn: { key: 'treatments.form.errors.endsOn', byMessage: ENDS_ON_REASON_KEYS },
} as const satisfies Record<string, FieldErrorKeys>

export type TreatmentFormResult<D> =
  { success: true; data: D } | { success: false; errors: TreatmentFormErrors }

export function treatmentFormErrorsOf(issues: z.core.$ZodIssue[]): TreatmentFormErrors {
  return fieldErrorsOf(issues, ERROR_KEYS, { fieldOfPath: FIELD_OF_PATH })
}

export function treatmentFormResultOf<D>(result: z.ZodSafeParseResult<D>): TreatmentFormResult<D> {
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: treatmentFormErrorsOf(result.error.issues) }
}
