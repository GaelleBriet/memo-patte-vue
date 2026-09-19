import type { z } from 'zod'

import { addFrequency } from './treatment-frequency'
import {
  treatmentFrequencySchema,
  treatmentInputSchema,
  treatmentUpdateSchema,
  type FrequencyUnit,
  type Treatment,
  type TreatmentType,
} from '../schema/treatment.schema'

export interface TreatmentFormValues {
  name: string
  type: TreatmentType | null
  frequencyValue: string
  frequencyUnit: FrequencyUnit
  lastDoseDate: string
}

const ERROR_KEYS = {
  name: 'treatments.form.errors.name',
  type: 'treatments.form.errors.type',
  frequency: 'treatments.form.errors.frequency',
  lastDoseDate: 'treatments.form.errors.lastDoseDate',
} as const

const FUTURE_DOSE_KEY = 'treatments.form.errors.lastDoseDateFuture'
const FREQUENCY_MAX_KEY = 'treatments.form.errors.frequencyMax'

export type TreatmentFormErrorField = keyof typeof ERROR_KEYS
export type TreatmentFormErrors = Partial<Record<TreatmentFormErrorField, string>>

export type TreatmentFormResult =
  | { success: true; data: z.output<typeof treatmentUpdateSchema> }
  | { success: false; errors: TreatmentFormErrors }

export function emptyTreatmentFormValues(): TreatmentFormValues {
  return { name: '', type: null, frequencyValue: '', frequencyUnit: 'month', lastDoseDate: '' }
}

export function treatmentFormValuesFrom(treatment: Treatment): TreatmentFormValues {
  return {
    name: treatment.name,
    type: treatment.type,
    frequencyValue: String(treatment.frequency.value),
    frequencyUnit: treatment.frequency.unit,
    lastDoseDate: treatment.lastDoseDate,
  }
}

function frequencyOf(values: TreatmentFormValues) {
  const trimmed = values.frequencyValue.trim()

  return { value: trimmed === '' ? Number.NaN : Number(trimmed), unit: values.frequencyUnit }
}

function isErrorField(field: string): field is TreatmentFormErrorField {
  return Object.prototype.hasOwnProperty.call(ERROR_KEYS, field)
}

// Le seul `refine` du schéma est la borne « pas dans le futur » : c'est lui qui émet `custom`.
function errorKeyFor(field: TreatmentFormErrorField, issue: z.core.$ZodIssue): string {
  if (field === 'lastDoseDate' && issue.code === 'custom') return FUTURE_DOSE_KEY
  if (field === 'frequency' && issue.code === 'too_big') return FREQUENCY_MAX_KEY

  return ERROR_KEYS[field]
}

export function validateTreatmentForm(values: TreatmentFormValues): TreatmentFormResult {
  const result = treatmentUpdateSchema.safeParse({
    name: values.name,
    type: values.type,
    frequency: frequencyOf(values),
    lastDoseDate: values.lastDoseDate.trim(),
  })

  if (result.success) return { success: true, data: result.data }

  const errors: TreatmentFormErrors = {}

  for (const issue of result.error.issues) {
    const field = String(issue.path[0])

    if (isErrorField(field)) errors[field] ??= errorKeyFor(field, issue)
  }

  return { success: false, errors }
}

/** Prochaine dose calculée en direct, ou `null` tant que fréquence et date ne sont pas valides. */
export function nextDoseDate(values: TreatmentFormValues): string | null {
  const frequency = treatmentFrequencySchema.safeParse(frequencyOf(values))
  const lastDose = treatmentInputSchema.shape.lastDoseDate.safeParse(values.lastDoseDate.trim())

  if (!frequency.success || !lastDose.success) return null

  return addFrequency(lastDose.data, frequency.data)
}
