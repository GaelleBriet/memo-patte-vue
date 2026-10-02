import type { z } from 'zod'

import {
  editionDraft,
  treatmentEditionSchemaFor,
  treatmentResumptionSchemaFor,
  type EditionDraft,
} from './treatment-plan'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import {
  treatmentCreationSchema,
  treatmentRhythmSchema,
  type TreatmentRhythm,
} from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { FrequencyUnit, TreatmentType } from '../schema/treatment.schema'
import { isClockTime, MAX_TIMES_PER_DAY } from '@/shared/domain/clock-time'
import { formatDoseQuantity, TABLET_SHORTCUTS, type DoseUnit } from '@/shared/domain/dosage'
import type { MoveRefusal } from '@/shared/domain/treatment-schedule'

export interface TreatmentFormValues {
  name: string
  type: TreatmentType | null
  frequencyValue: string
  frequencyUnit: FrequencyUnit
  /** Création et reprise. */
  firstDoseOn: string
  /** Modification : la date proposée tant qu'elle n'est pas changée. */
  nextDoseOn: string
  times: string[]
  doseQuantity: string
  doseUnit: DoseUnit | null
  endsOn: string
}

const ERROR_KEYS = {
  name: 'treatments.form.errors.name',
  type: 'treatments.form.errors.type',
  frequency: 'treatments.form.errors.frequency',
  firstDoseOn: 'treatments.form.errors.firstDoseOn',
  nextDoseOn: 'treatments.form.errors.nextDoseOn',
  times: 'treatments.form.errors.times',
  dosage: 'treatments.form.errors.dosageQuantity',
  endsOn: 'treatments.form.errors.endsOn',
} as const

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

/** Motif d'un refus, porté par le message de l'erreur Zod. */
const REASON_KEYS: Partial<Record<TreatmentFormErrorField, Record<string, string>>> = {
  firstDoseOn: {
    beforePreviousPeriod: 'treatments.form.errors.firstDoseOnBeforePreviousPeriod',
  },
  nextDoseOn: {
    tooEarly: 'treatments.form.errors.nextDoseOnTooEarly',
    afterEnd: 'treatments.form.errors.nextDoseOnAfterEnd',
    refused: 'treatments.form.errors.nextDoseOnRefused',
  },
  dosage: { incomplete: 'treatments.form.errors.dosageIncomplete' },
  endsOn: {
    beforeFirstDose: 'treatments.form.errors.endsOnBeforeFirstDose',
    beforeNextDose: 'treatments.form.errors.endsOnBeforeNextDose',
    beforeLastDose: 'treatments.form.errors.endsOnBeforeLastDose',
  },
}

const REFUSAL_KEYS: Record<MoveRefusal, string> = {
  'later-line': 'treatments.form.nextDoseOn.refusal.laterLine',
  'later-dose': 'treatments.form.nextDoseOn.refusal.laterDose',
  'no-date-left': 'treatments.form.nextDoseOn.refusal.noDateLeft',
  'arrival-logged': 'treatments.form.nextDoseOn.refusal.arrivalLogged',
  'previous-period': 'treatments.form.errors.nextDoseOnRefused',
}

/** Texte d'aide du champ « Prochaine dose » grisé. */
export function nextDoseRefusalKey(refusal: MoveRefusal): string {
  return REFUSAL_KEYS[refusal]
}

const FREQUENCY_MAX_KEY = 'treatments.form.errors.frequencyMax'
const NAME_MAX_KEY = 'treatments.form.errors.nameMax'

type FormResult<D> = { success: true; data: D } | { success: false; errors: TreatmentFormErrors }

export type TreatmentCreationResult = FormResult<z.output<typeof treatmentCreationSchema>>
export type TreatmentEditionResult = FormResult<
  z.output<ReturnType<typeof treatmentEditionSchemaFor>>
>
export type TreatmentResumptionResult = FormResult<
  z.output<ReturnType<typeof treatmentResumptionSchemaFor>>
>

export function emptyTreatmentFormValues(): TreatmentFormValues {
  return {
    name: '',
    type: null,
    frequencyValue: '',
    frequencyUnit: 'month',
    firstDoseOn: '',
    nextDoseOn: '',
    times: [],
    doseQuantity: '',
    doseUnit: null,
    endsOn: '',
  }
}

/** Les réglages d'une période, tels que le formulaire les montre ; ses dates restent à choisir. */
export function treatmentFormValuesFrom(
  treatment: Pick<TreatmentWithHistory, 'name' | 'type'>,
  period: TreatmentPeriodRecord,
): TreatmentFormValues {
  return {
    name: treatment.name,
    type: treatment.type,
    frequencyValue: String(period.frequency.value),
    frequencyUnit: period.frequency.unit,
    firstDoseOn: '',
    nextDoseOn: '',
    times: [...period.times].sort(),
    doseQuantity:
      period.doseQuantity === null || period.doseUnit === null
        ? ''
        : formatDoseQuantity(period.doseQuantity, period.doseUnit),
    doseUnit: period.doseUnit,
    endsOn: period.endsOn ?? '',
  }
}

const FRACTION_VALUES: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 }

/** `0,5`, `0.5`, `½`, `1 ½` ; `null` pour un champ vide, `NaN` pour une saisie illisible. */
export function parseDoseQuantity(text: string): number | null {
  const trimmed = text.replaceAll('\u00a0', ' ').trim()
  if (trimmed === '') return null
  const fraction = /^(\d+)?\s*([¼½¾])$/.exec(trimmed)
  if (fraction) return Number(fraction[1] ?? 0) + (FRACTION_VALUES[fraction[2] ?? ''] ?? 0)
  return /^\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : Number.NaN
}

/** La quantité saisie, récrite pour l'unité choisie : `0,5` devient `½` pour un comprimé. */
export function doseQuantityTextFor(text: string, unit: DoseUnit | null): string {
  const quantity = parseDoseQuantity(text)
  if (quantity === null || Number.isNaN(quantity) || unit === null) return text
  return formatDoseQuantity(quantity, unit)
}

export type DoseShortcut = { value: number; label: string }

/** `¼ ½ ¾ 1 1 ½` : les raccourcis de quantité des comprimés. */
export function tabletShortcuts(): DoseShortcut[] {
  return TABLET_SHORTCUTS.map((value) => ({ value, label: formatDoseQuantity(value, 'tablet') }))
}

export function canAddTime(times: readonly string[]): boolean {
  return times.length < MAX_TIMES_PER_DAY
}

/** Heures dans l'ordre de la journée ; une heure illisible, déjà présente ou de trop ne change rien. */
export function withTime(times: readonly string[], time: string): string[] {
  if (!isClockTime(time) || times.includes(time) || !canAddTime(times)) return [...times]
  return [...times, time].sort()
}

export function withoutTime(times: readonly string[], time: string): string[] {
  return times.filter((other) => other !== time)
}

export function withTimeChanged(times: readonly string[], previous: string, time: string) {
  return isClockTime(time) ? withTime(withoutTime(times, previous), time) : [...times]
}

function frequencyOf(values: TreatmentFormValues) {
  const trimmed = values.frequencyValue.trim()

  return { value: trimmed === '' ? Number.NaN : Number(trimmed), unit: values.frequencyUnit }
}

function rhythmInput(values: TreatmentFormValues) {
  return {
    frequency: frequencyOf(values),
    times: values.times,
    doseQuantity: parseDoseQuantity(values.doseQuantity),
    doseUnit: values.doseUnit,
    endsOn: values.endsOn.trim() === '' ? null : values.endsOn.trim(),
  }
}

/** Les réglages saisis, ou `null` tant qu'ils ne sont pas valides. */
export function rhythmOfValues(values: TreatmentFormValues): TreatmentRhythm | null {
  const result = treatmentRhythmSchema.safeParse(rhythmInput(values))
  return result.success ? result.data : null
}

function errorKeyFor(field: TreatmentFormErrorField, issue: z.core.$ZodIssue): string {
  const reason = REASON_KEYS[field]?.[issue.message]
  if (reason !== undefined) return reason
  if (field === 'frequency' && issue.code === 'too_big') return FREQUENCY_MAX_KEY
  if (field === 'name' && issue.code === 'too_big') return NAME_MAX_KEY

  return ERROR_KEYS[field]
}

function errorsOf(issues: z.core.$ZodIssue[]): TreatmentFormErrors {
  const errors: TreatmentFormErrors = {}

  for (const issue of issues) {
    const field = FIELD_OF_PATH[String(issue.path[0])]

    if (field !== undefined) errors[field] ??= errorKeyFor(field, issue)
  }

  return errors
}

function resultOf<D>(result: z.ZodSafeParseResult<D>): FormResult<D> {
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: errorsOf(result.error.issues) }
}

export function validateTreatmentCreation(
  values: TreatmentFormValues,
  animalId: string,
): TreatmentCreationResult {
  return resultOf(
    treatmentCreationSchema.safeParse({
      animalId,
      name: values.name,
      type: values.type,
      firstDoseOn: values.firstDoseOn.trim(),
      ...rhythmInput(values),
    }),
  )
}

/** Ce que « Modifier » ferait de la saisie en cours ; lève quand l'historique est illisible. */
export function editionDraftOf(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
): EditionDraft {
  return editionDraft(history, rhythmOfValues(values), today)
}

/** « Prochaine dose » n'est envoyée que si elle est proposée : vide, elle est alors refusée. */
export function validateTreatmentEdition(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
): TreatmentEditionResult {
  const { nextDose } = editionDraftOf(values, history, today)
  return resultOf(
    treatmentEditionSchemaFor(history, today).safeParse({
      name: values.name,
      type: values.type,
      ...rhythmInput(values),
      nextDoseOn: nextDose === null ? null : values.nextDoseOn.trim(),
    }),
  )
}

export function validateTreatmentResumption(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
): TreatmentResumptionResult {
  return resultOf(
    treatmentResumptionSchemaFor(history, today).safeParse({
      firstDoseOn: values.firstDoseOn.trim(),
      ...rhythmInput(values),
    }),
  )
}
