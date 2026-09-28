import type { z } from 'zod'

import {
  vaccinationInputSchema,
  vaccinationUpdateSchema,
  type Vaccination,
} from '../schema/vaccination.schema'

export interface VaccinationFormValues {
  name: string
  lastInjectionDate: string
  dueDate: string
}

const ERROR_KEYS = {
  name: 'vaccinations.form.errors.name',
  lastInjectionDate: 'vaccinations.form.errors.lastInjectionDate',
  dueDate: 'vaccinations.form.errors.dueDate',
} as const

const FUTURE_INJECTION_KEY = 'vaccinations.form.errors.lastInjectionDateFuture'
const MAX_NAME_KEY = 'vaccinations.form.errors.nameMax'

export type VaccinationFormErrorField = keyof typeof ERROR_KEYS
export type VaccinationFormErrors = Partial<Record<VaccinationFormErrorField, string>>

export type VaccinationFormResult =
  | { success: true; data: z.output<typeof vaccinationUpdateSchema> }
  | { success: false; errors: VaccinationFormErrors }

export function emptyVaccinationFormValues(): VaccinationFormValues {
  return { name: '', lastInjectionDate: '', dueDate: '' }
}

export function vaccinationFormValuesFrom(vaccination: Vaccination): VaccinationFormValues {
  return {
    name: vaccination.name,
    lastInjectionDate: vaccination.lastInjectionDate,
    dueDate: vaccination.dueDate ?? '',
  }
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim()

  return trimmed === '' ? null : trimmed
}

function isErrorField(field: string): field is VaccinationFormErrorField {
  return Object.prototype.hasOwnProperty.call(ERROR_KEYS, field)
}

// Le seul `refine` du schéma est la borne « pas dans le futur » : c'est lui qui émet `custom`.
function errorKeyFor(field: VaccinationFormErrorField, issue: z.core.$ZodIssue): string {
  if (field === 'lastInjectionDate' && issue.code === 'custom') return FUTURE_INJECTION_KEY
  if (field === 'name' && issue.code === 'too_big') return MAX_NAME_KEY

  return ERROR_KEYS[field]
}

export function validateVaccinationForm(values: VaccinationFormValues): VaccinationFormResult {
  const result = vaccinationUpdateSchema.safeParse({
    name: values.name,
    lastInjectionDate: values.lastInjectionDate.trim(),
    dueDate: textOrNull(values.dueDate),
  })

  if (result.success) return { success: true, data: result.data }

  const errors: VaccinationFormErrors = {}

  for (const issue of result.error.issues) {
    const field = String(issue.path[0])

    if (isErrorField(field)) errors[field] ??= errorKeyFor(field, issue)
  }

  return { success: false, errors }
}

/** La date d'injection saisie si elle est valide, passée ou du jour ; `null` sinon. */
export function enteredInjectionDate(values: VaccinationFormValues): string | null {
  const date = vaccinationInputSchema.shape.lastInjectionDate.safeParse(
    values.lastInjectionDate.trim(),
  )
  return date.success ? date.data : null
}
