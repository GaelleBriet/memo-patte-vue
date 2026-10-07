import { z } from 'zod'

import { nextReminderDate, type NextReminderChoice } from './vaccination-done'
import { nextReminderSummary } from './vaccination-sheet'
import {
  injectionDateSchema,
  vaccinationUpdateSchema,
  type Vaccination,
} from '../schema/vaccination.schema'
import { formatDayMonthOrYear } from '@/shared/utils/format'

type Translate = (key: string, named?: Record<string, unknown>) => string

export interface VaccinationFormValues {
  name: string
  lastInjectionDate: string
  /** Rendez-vous d'un vaccin sans injection (V10 bis). */
  plannedDate: string
  /** Raccourci du prochain rappel, compté depuis l'injection (V10 ter). */
  reminder: NextReminderChoice | null
}

export interface VaccinationFormData {
  name: string
  lastInjectionDate: string | null
  dueDate: string | null
}

export interface VaccinationFormContext {
  today: string
  /** Rendez-vous déjà enregistré : « Modifier » le garde même passé. */
  currentPlannedDate?: string
}

const ERROR_KEYS = {
  name: 'vaccinations.form.errors.name',
  lastInjectionDate: 'vaccinations.form.errors.lastInjectionDate',
  plannedDate: 'vaccinations.form.errors.plannedDate',
} as const

const CUSTOM_ERROR_KEYS: Partial<Record<VaccinationFormErrorField, string>> = {
  lastInjectionDate: 'vaccinations.form.errors.lastInjectionDateFuture',
  plannedDate: 'vaccinations.form.errors.plannedDatePast',
}
const MAX_NAME_KEY = 'vaccinations.form.errors.nameMax'

export type VaccinationFormErrorField = keyof typeof ERROR_KEYS
export type VaccinationFormErrors = Partial<Record<VaccinationFormErrorField, string>>

export type VaccinationFormResult =
  { success: true; data: VaccinationFormData } | { success: false; errors: VaccinationFormErrors }

export function emptyVaccinationFormValues(): VaccinationFormValues {
  return { name: '', lastInjectionDate: '', plannedDate: '', reminder: null }
}

function currentReminder(dueDate: string | null): NextReminderChoice {
  return dueDate === null ? { kind: 'none' } : { kind: 'otherDate', date: dueDate }
}

export function vaccinationFormValuesFrom(vaccination: Vaccination): VaccinationFormValues {
  if (vaccination.lastInjectionDate === null) {
    return {
      name: vaccination.name,
      lastInjectionDate: '',
      plannedDate: vaccination.dueDate ?? '',
      reminder: null,
    }
  }
  return {
    name: vaccination.name,
    lastInjectionDate: vaccination.lastInjectionDate,
    plannedDate: '',
    reminder: currentReminder(vaccination.dueDate),
  }
}

export function hasInjection(values: VaccinationFormValues): boolean {
  return values.lastInjectionDate.trim() !== ''
}

export function withoutReminder(values: VaccinationFormValues): VaccinationFormValues {
  return { ...values, plannedDate: '', reminder: null }
}

/** Saisir ou effacer l'injection change la forme du prochain rappel : il repart de zéro. */
export function withInjectionDate(
  values: VaccinationFormValues,
  lastInjectionDate: string,
): VaccinationFormValues {
  const next = { ...values, lastInjectionDate }
  return hasInjection(next) === hasInjection(values) ? next : withoutReminder(next)
}

export function isPlannedDateAllowed(
  date: string,
  { today, currentPlannedDate }: VaccinationFormContext,
): boolean {
  return date >= today || date === currentPlannedDate
}

export function minPlannedDate({ today, currentPlannedDate }: VaccinationFormContext): string {
  return currentPlannedDate !== undefined && currentPlannedDate < today ? currentPlannedDate : today
}

/** Le rappel que donne le raccourci coché, compté depuis l'injection saisie. */
export function reminderSummary(t: Translate, values: VaccinationFormValues): string | null {
  const injectedOn = enteredInjectionDate(values)
  if (values.reminder === null || injectedOn === null) return null
  return nextReminderSummary(t, injectedOn, values.reminder).text
}

function formSchema(context: VaccinationFormContext) {
  return z.object({
    name: vaccinationUpdateSchema.shape.name,
    lastInjectionDate: z.iso
      .date()
      .refine((date) => date <= context.today)
      .nullable(),
    plannedDate: z.iso
      .date()
      .refine((date) => isPlannedDateAllowed(date, context))
      .optional(),
  })
}

function isErrorField(field: string): field is VaccinationFormErrorField {
  return Object.prototype.hasOwnProperty.call(ERROR_KEYS, field)
}

function errorKeyFor(field: VaccinationFormErrorField, issue: z.core.$ZodIssue): string {
  if (issue.code === 'custom') return CUSTOM_ERROR_KEYS[field] ?? ERROR_KEYS[field]
  if (field === 'name' && issue.code === 'too_big') return MAX_NAME_KEY

  return ERROR_KEYS[field]
}

/** Avec une injection, le prochain rappel vient des raccourcis ; sans, du rendez-vous, obligatoire. */
export function validateVaccinationForm(
  values: VaccinationFormValues,
  context: VaccinationFormContext,
): VaccinationFormResult {
  const injected = hasInjection(values)
  const result = formSchema(context).safeParse({
    name: values.name,
    lastInjectionDate: injected ? values.lastInjectionDate.trim() : null,
    plannedDate: injected ? undefined : values.plannedDate.trim() || null,
  })

  if (result.success) {
    const { name, lastInjectionDate, plannedDate } = result.data
    const dueDate =
      lastInjectionDate === null
        ? (plannedDate ?? null)
        : values.reminder && nextReminderDate(lastInjectionDate, values.reminder)
    return { success: true, data: { name, lastInjectionDate, dueDate: dueDate ?? null } }
  }

  const errors: VaccinationFormErrors = {}

  for (const issue of result.error.issues) {
    const field = String(issue.path[0])

    if (isErrorField(field)) errors[field] ??= errorKeyFor(field, issue)
  }

  return { success: false, errors }
}

/** La date d'injection saisie si elle est valide, passée ou du jour ; `null` sinon. */
export function enteredInjectionDate(values: VaccinationFormValues): string | null {
  const date = injectionDateSchema.safeParse(values.lastInjectionDate.trim())
  return date.success ? date.data : null
}

/** L'aide de V10 bis, qui annonce le statut du vaccin à son rendez-vous. */
export function plannedDateHelp(t: Translate, plannedDate: string, today: string): string | null {
  const date = z.iso.date().safeParse(plannedDate.trim())
  if (!date.success) return null
  const status = t('vaccinations.section.status.planned', {
    date: formatDayMonthOrYear(date.data, today),
  })
  return t('vaccinations.form.plannedDate.help', { status })
}
