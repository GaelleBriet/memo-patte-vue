import type { z } from 'zod'

import {
  creationPastDues,
  editionDraft,
  treatmentCreationSchemaFor,
  treatmentEditionSchemaFor,
  treatmentResumptionSchemaFor,
  type EditionDraft,
} from './treatment-plan'
import { shiftHelpText, type ShiftHelp } from './treatment-shift-box'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import {
  treatmentRhythmSchema,
  type PastDose,
  type PastDuesChoice,
  type TreatmentRhythm,
} from '../schema/treatment-form.schema'
import {
  REMINDER_OFFSETS_MINUTES,
  type ReminderOffsetMinutes,
  type TreatmentPeriodRecord,
} from '../schema/treatment-period.schema'
import type { FrequencyUnit, TreatmentType } from '../schema/treatment.schema'
import type { ExactRemindersStatus, NotificationPermissionStatus } from '@/core/notifications'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import { isClockTime, MAX_TIMES_PER_DAY } from '@/shared/domain/clock-time'
import { formatDoseQuantity, TABLET_SHORTCUTS, type DoseUnit } from '@/shared/domain/dosage'
import type { Due, MoveRefusal } from '@/shared/domain/treatment-schedule'
import { formatDayMonthOrYear, withoutFinalDot } from '@/shared/utils/format'

type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export interface TreatmentFormValues {
  name: string
  type: TreatmentType | null
  frequencyValue: string
  frequencyUnit: FrequencyUnit
  /** Création et reprise. */
  firstDoseOn: string
  /** Modification : la date proposée tant qu'elle n'est pas changée. */
  nextDoseOn: string
  /** Modification : la case « Décaler aussi les doses suivantes », cochée par défaut. */
  shiftsFollowing: boolean
  times: string[]
  doseQuantity: string
  doseUnit: DoseUnit | null
  endsOn: string
  /** `null` : « À l'heure », jamais choisi. */
  reminderOffset: ReminderOffsetMinutes | null
  /** Sans heure de traitement ; `null` : 9 h, jamais choisie. */
  reminderTime: string | null
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

/** Motif d'un refus, porté par le message de l'erreur Zod. */
const REASON_KEYS: Partial<Record<TreatmentFormErrorField, Record<string, string>>> = {
  firstDoseOn: {
    tooEarly: 'treatments.form.errors.firstDoseOnTooEarly',
    tooOld: 'treatments.form.errors.firstDoseOnTooOld',
  },
  nextDoseOn: {
    tooEarly: 'treatments.form.errors.nextDoseOnTooEarly',
    afterEnd: 'treatments.form.errors.nextDoseOnAfterEnd',
    afterNextDose: 'treatments.form.errors.nextDoseOnAfterNextDose',
    refused: 'treatments.form.errors.nextDoseOnRefused',
  },
  dosage: { incomplete: 'treatments.form.errors.dosageIncomplete' },
  endsOn: {
    beforeFirstDose: 'treatments.form.errors.endsOnBeforeFirstDose',
    beforeNextDose: 'treatments.form.errors.endsOnBeforeNextDose',
    beforeLastDose: 'treatments.form.errors.endsOnBeforeLastDose',
    beforePostponedDose: 'treatments.form.errors.endsOnBeforePostponedDose',
    beforeAdvancedDose: 'treatments.form.errors.endsOnBeforeAdvancedDose',
    beforeFarPostponedDose: 'treatments.form.errors.endsOnBeforeFarPostponedDose',
    beforeFarAdvancedDose: 'treatments.form.errors.endsOnBeforeFarAdvancedDose',
  },
}

const REFUSAL_KEYS: Record<MoveRefusal, string> = {
  'later-line': 'treatments.form.nextDoseOn.refusal.laterLine',
  'later-dose': 'treatments.form.nextDoseOn.refusal.laterDose',
  'no-date-left': 'treatments.form.nextDoseOn.refusal.noDateLeft',
  'arrival-logged': 'treatments.form.nextDoseOn.refusal.arrivalLogged',
  'previous-period': 'treatments.form.errors.nextDoseOnRefused',
  'no-date-alone': 'treatments.form.errors.nextDoseOnRefused',
}

/** L'aide sous la case « Décaler aussi les doses suivantes » de « Prochaine dose ». */
export function nextDoseShiftHelp(
  t: Translate,
  draft: Pick<EditionDraft, 'nextDose' | 'period'>,
  values: Pick<TreatmentFormValues, 'nextDoseOn' | 'shiftsFollowing'>,
  today: string,
): ShiftHelp | null {
  const shift = draft.nextDose?.shift ?? null
  if (shift === null) return null
  const chosenOn = values.nextDoseOn.trim()
  if (!values.shiftsFollowing && shift.aloneLatest !== null && chosenOn > shift.aloneLatest) {
    const date = withoutFinalDot(formatDayMonthOrYear(shift.aloneLatest, today))
    return { text: t('treatments.shift.aloneLatest', { date }), warning: true }
  }
  const following = values.shiftsFollowing ? shift.following : shift.followingAlone
  return shiftHelpText(
    t,
    draft.period,
    {
      shifts: values.shiftsFollowing,
      following,
      lost: shift.lost,
      weekdayOn: values.shiftsFollowing ? chosenOn : null,
    },
    today,
  )
}

/** Texte d'aide du champ « Prochaine dose » grisé. */
export function nextDoseRefusalKey(refusal: MoveRefusal): string {
  return REFUSAL_KEYS[refusal]
}

const FREQUENCY_MAX_KEY = 'treatments.form.errors.frequencyMax'
const NAME_MAX_KEY = 'treatments.form.errors.nameMax'

type FormResult<D> = { success: true; data: D } | { success: false; errors: TreatmentFormErrors }

export type TreatmentCreationResult = FormResult<
  z.output<ReturnType<typeof treatmentCreationSchemaFor>>
>
export type TreatmentEditionResult =
  | { success: true; data: z.output<ReturnType<typeof treatmentEditionSchemaFor>> }
  | { success: false; errors: TreatmentFormErrors; needsPastDuesChoice: boolean }
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
    shiftsFollowing: true,
    times: [],
    doseQuantity: '',
    doseUnit: null,
    endsOn: '',
    reminderOffset: null,
    reminderTime: null,
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
    shiftsFollowing: true,
    times: [...period.times].sort(),
    doseQuantity:
      period.doseQuantity === null || period.doseUnit === null
        ? ''
        : formatDoseQuantity(period.doseQuantity, period.doseUnit),
    doseUnit: period.doseUnit,
    endsOn: period.endsOn ?? '',
    reminderOffset: period.reminderOffsetMinutes,
    reminderTime: period.reminderTime,
  }
}

const OFFSETS_WITHOUT_EXACT: readonly ReminderOffsetMinutes[] = [0, 60]

/** Les moments du rappel proposés ; `kept`, déjà choisi, le reste sans les rappels précis (RA-23). */
export function reminderOffsetChoices(
  exact: ExactRemindersStatus | null,
  kept: ReminderOffsetMinutes | null,
): ReminderOffsetMinutes[] {
  if (exact === 'precise') return [...REMINDER_OFFSETS_MINUTES]
  return REMINDER_OFFSETS_MINUTES.filter(
    (offset) => OFFSETS_WITHOUT_EXACT.includes(offset) || offset === kept,
  )
}

/** La suggestion des rappels précis, au plus une fois : quand le traitement reçoit sa première heure. */
export function suggestsExactReminders(
  before: readonly string[],
  after: readonly string[],
  context: {
    exact: ExactRemindersStatus | null
    notifications: NotificationPermissionStatus | null
    alreadySuggested: boolean
  },
): boolean {
  return (
    before.length === 0 &&
    after.length > 0 &&
    context.exact === 'never-enabled' &&
    context.notifications === 'granted' &&
    !context.alreadySuggested
  )
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

/** L'heure est déjà celle d'une autre puce que `except`. */
export function isTimeTaken(times: readonly string[], time: string, except?: string): boolean {
  return time !== except && times.includes(time)
}

/** Une heure illisible ou déjà prise ne change rien. */
export function withTimeChanged(times: readonly string[], previous: string, time: string) {
  if (!isClockTime(time) || isTimeTaken(times, time, previous)) return [...times]
  return withTime(withoutTime(times, previous), time)
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
    ...(values.reminderOffset === null ? {} : { reminderOffsetMinutes: values.reminderOffset }),
    ...(values.reminderTime === null ? {} : { reminderTime: values.reminderTime }),
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

/** `pastDoses` : la réponse de l'encart des doses passées, `null` s'il n'est pas rempli. */
export function validateTreatmentCreation(
  values: TreatmentFormValues,
  animalId: string,
  today: string,
  pastDoses: PastDose[] | null = null,
): TreatmentCreationResult {
  return resultOf(
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

/** Ce que « Modifier » ferait de la saisie en cours ; lève quand l'historique est illisible. */
export function editionDraftOf(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
): EditionDraft {
  const chosenOn = values.nextDoseOn.trim()
  return editionDraft(
    history,
    rhythmOfValues(values),
    today,
    isCalendarDay(chosenOn) ? chosenOn : null,
    values.shiftsFollowing,
  )
}

/**
 * « Prochaine dose » n'est envoyée que si elle est proposée : vide, elle est alors refusée. Avec une
 * réponse `pastDues`, la date envoyée est celle que la question a annoncée pour ce choix.
 * `needsPastDuesChoice` : la saisie est valide, il reste à poser la question des échéances tombées.
 */
export function validateTreatmentEdition(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
  pastDues: PastDuesChoice | null = null,
): TreatmentEditionResult {
  const { nextDose, pastDuesNextDose } = editionDraftOf(values, history, today)
  const typed = values.nextDoseOn.trim()
  const announcedOn = pastDues === null ? null : (pastDuesNextDose?.[pastDues] ?? null)
  const result = treatmentEditionSchemaFor(history, today).safeParse({
    name: values.name,
    type: values.type,
    ...rhythmInput(values),
    nextDoseOn: announcedOn ?? (nextDose === null ? null : typed),
    ...(values.shiftsFollowing ? {} : { shiftsFollowing: false }),
    ...(pastDues === null ? {} : { pastDues }),
  })
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    errors: errorsOf(result.error.issues),
    needsPastDuesChoice: result.error.issues.every(({ path }) => path[0] === 'pastDues'),
  }
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

/** Ce dont dépend une réponse de l'encart : changé, la réponse ne vaut plus (TR-3). */
export function pastDosesBasis(values: TreatmentFormValues, dues: readonly Due[]): string {
  const { firstDoseOn, frequencyValue, frequencyUnit, times, endsOn } = values
  return JSON.stringify([firstDoseOn, frequencyValue, frequencyUnit, times, endsOn, dues.length])
}
