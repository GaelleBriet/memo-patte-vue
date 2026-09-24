import type { z } from 'zod'

import { addFrequency } from './treatment-frequency'
import {
  treatmentEditSchema,
  treatmentEditSchemaAfter,
  treatmentFormSchema,
  treatmentFrequencySchema,
  treatmentInputSchema,
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
  /** Saisie seulement dans « Modifier » : à la création, elle est calculée. */
  nextDueDate: string
}

const ERROR_KEYS = {
  name: 'treatments.form.errors.name',
  type: 'treatments.form.errors.type',
  frequency: 'treatments.form.errors.frequency',
  lastDoseDate: 'treatments.form.errors.lastDoseDate',
  nextDueDate: 'treatments.form.errors.nextDueDate',
} as const

const FUTURE_DOSE_KEY = 'treatments.form.errors.lastDoseDateFuture'
const BEFORE_LAST_DOSE_KEY = 'treatments.form.errors.nextDueDateBeforeLastDose'
const FREQUENCY_MAX_KEY = 'treatments.form.errors.frequencyMax'

export type TreatmentFormErrorField = keyof typeof ERROR_KEYS
export type TreatmentFormErrors = Partial<Record<TreatmentFormErrorField, string>>

type FormResult<D> = { success: true; data: D } | { success: false; errors: TreatmentFormErrors }

export type TreatmentFormResult = FormResult<z.output<typeof treatmentFormSchema>>
export type TreatmentEditFormResult = FormResult<z.output<typeof treatmentEditSchema>>

export function emptyTreatmentFormValues(): TreatmentFormValues {
  return {
    name: '',
    type: null,
    frequencyValue: '',
    frequencyUnit: 'month',
    lastDoseDate: '',
    nextDueDate: '',
  }
}

export function treatmentFormValuesFrom(treatment: Treatment): TreatmentFormValues {
  return {
    name: treatment.name,
    type: treatment.type,
    frequencyValue: String(treatment.frequency.value),
    frequencyUnit: treatment.frequency.unit,
    lastDoseDate: treatment.lastDoseDate,
    nextDueDate: treatment.nextDueDate,
  }
}

function frequencyOf(values: TreatmentFormValues) {
  const trimmed = values.frequencyValue.trim()

  return { value: trimmed === '' ? Number.NaN : Number(trimmed), unit: values.frequencyUnit }
}

function isErrorField(field: string): field is TreatmentFormErrorField {
  return Object.prototype.hasOwnProperty.call(ERROR_KEYS, field)
}

// Les seuls `refine` des schémas sont les bornes de date : ce sont eux qui émettent `custom`.
function errorKeyFor(field: TreatmentFormErrorField, issue: z.core.$ZodIssue): string {
  if (field === 'lastDoseDate' && issue.code === 'custom') return FUTURE_DOSE_KEY
  if (field === 'nextDueDate' && issue.code === 'custom') return BEFORE_LAST_DOSE_KEY
  if (field === 'frequency' && issue.code === 'too_big') return FREQUENCY_MAX_KEY

  return ERROR_KEYS[field]
}

function errorsOf(issues: z.core.$ZodIssue[]): TreatmentFormErrors {
  const errors: TreatmentFormErrors = {}

  for (const issue of issues) {
    const field = String(issue.path[0])

    if (isErrorField(field)) errors[field] ??= errorKeyFor(field, issue)
  }

  return errors
}

export function validateTreatmentForm(values: TreatmentFormValues): TreatmentFormResult {
  const result = treatmentFormSchema.safeParse({
    name: values.name,
    type: values.type,
    frequency: frequencyOf(values),
    lastDoseDate: values.lastDoseDate.trim(),
  })

  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: errorsOf(result.error.issues) }
}

export function validateTreatmentEditForm(values: TreatmentFormValues): TreatmentEditFormResult {
  const lastDose = treatmentInputSchema.shape.lastDoseDate.safeParse(values.lastDoseDate.trim())
  const schema = lastDose.success ? treatmentEditSchemaAfter(lastDose.data) : treatmentEditSchema
  const result = schema.safeParse({
    name: values.name,
    type: values.type,
    frequency: frequencyOf(values),
    nextDueDate: values.nextDueDate.trim(),
  })

  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: errorsOf(result.error.issues) }
}

/** Prochaine dose calculée en direct, ou `null` tant que fréquence et date ne sont pas valides. */
export function nextDoseDate(values: TreatmentFormValues): string | null {
  const frequency = treatmentFrequencySchema.safeParse(frequencyOf(values))
  const lastDose = treatmentInputSchema.shape.lastDoseDate.safeParse(values.lastDoseDate.trim())

  if (!frequency.success || !lastDose.success) return null

  return addFrequency(lastDose.data, frequency.data)
}

/**
 * Prochaine dose que « Modifier » propose : la dernière prise plus la fréquence saisie, ou celle
 * enregistrée, report compris, tant que la fréquence reste celle du plan.
 */
export function editedNextDueDate(
  values: TreatmentFormValues,
  treatment: Pick<Treatment, 'frequency' | 'lastDoseDate' | 'nextDueDate'>,
): string | null {
  const frequency = treatmentFrequencySchema.safeParse(frequencyOf(values))
  if (!frequency.success) return null

  const { value, unit } = frequency.data
  if (value === treatment.frequency.value && unit === treatment.frequency.unit) {
    return treatment.nextDueDate
  }
  return addFrequency(treatment.lastDoseDate, frequency.data)
}
