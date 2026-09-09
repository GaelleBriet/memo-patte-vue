import { format } from 'date-fns'
import type { z } from 'zod'

import { vaccinationUpdateSchema, type Vaccination } from './vaccination.schema'

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

export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
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
