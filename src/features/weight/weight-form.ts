import { format } from 'date-fns'
import type { z } from 'zod'

import { weightEntryInputSchema } from './weight.schema'

export interface WeightFormValues {
  /** `null` tant que l'animal n'est ni donné par le contexte ni choisi dans la feuille. */
  animalId: string | null
  weightKg: string
  measuredOn: string
}

const ERROR_KEYS = {
  animalId: 'weight.form.errors.animalId',
  weightKg: 'weight.form.errors.weightKg',
  measuredOn: 'weight.form.errors.measuredOn',
} as const

const FUTURE_DATE_KEY = 'weight.form.errors.measuredOnFuture'

export type WeightFormErrorField = keyof typeof ERROR_KEYS
export type WeightFormErrors = Partial<Record<WeightFormErrorField, string>>

export type WeightFormResult =
  | { success: true; data: z.output<typeof weightEntryInputSchema> }
  | { success: false; errors: WeightFormErrors }

export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** La date est pré-remplie à aujourd'hui : la feuille tient sa promesse des deux taps. */
export function emptyWeightFormValues(animalId: string | null = null): WeightFormValues {
  return { animalId, weightKg: '', measuredOn: todayIsoDate() }
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim()

  return trimmed === '' ? null : Number(trimmed.replace(',', '.'))
}

function isErrorField(field: string): field is WeightFormErrorField {
  return Object.prototype.hasOwnProperty.call(ERROR_KEYS, field)
}

// Le seul `refine` du schéma est la borne « pas dans le futur » : c'est lui qui émet `custom`.
function errorKeyFor(field: WeightFormErrorField, issue: z.core.$ZodIssue): string {
  if (field === 'measuredOn' && issue.code === 'custom') return FUTURE_DATE_KEY

  return ERROR_KEYS[field]
}

export function validateWeightForm(values: WeightFormValues): WeightFormResult {
  const result = weightEntryInputSchema.safeParse({
    animalId: values.animalId,
    weightKg: numberOrNull(values.weightKg),
    measuredOn: values.measuredOn.trim(),
  })

  if (result.success) return { success: true, data: result.data }

  const errors: WeightFormErrors = {}

  for (const issue of result.error.issues) {
    const field = String(issue.path[0])

    if (isErrorField(field)) errors[field] ??= errorKeyFor(field, issue)
  }

  return { success: false, errors }
}
