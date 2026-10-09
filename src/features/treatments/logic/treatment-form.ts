import type { z } from 'zod'

import { creationPastDues, treatmentCreationSchemaFor } from './treatment-creation'
import {
  editionDraft,
  treatmentEditionSchemaFor,
  type EditionDraft,
  type EndsOnIssueReason,
  type NextDoseOnIssueReason,
} from './treatment-edition'
import { resumptionDraft, treatmentResumptionSchemaFor } from './treatment-resumption'
import { parseDoseQuantity } from './treatment-dosage-input'
import { shiftHelpText, type ShiftHelp } from './treatment-shift-box'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import {
  treatmentRhythmSchema,
  type PastDose,
  type PastDuesChoice,
  type TreatmentRhythm,
} from '../schema/treatment-form.schema'
import type {
  ReminderOffsetMinutes,
  TreatmentPeriodRecord,
} from '../schema/treatment-period.schema'
import type { FrequencyUnit, TreatmentType } from '../schema/treatment.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import { sortedTimes } from '@/shared/domain/clock-time'
import { formatDoseQuantity, type DoseUnit } from '@/shared/domain/dosage'
import type { Due, MoveRefusal } from '@/shared/domain/treatment-schedule'
import { fieldErrorsOf, type FieldErrorKeys } from '@/shared/form/field-errors'
import { formatDayMonthOrYear, withoutFinalDot } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

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
    times: sortedTimes(period.times),
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

function errorsOf(issues: z.core.$ZodIssue[]): TreatmentFormErrors {
  return fieldErrorsOf(issues, ERROR_KEYS, { fieldOfPath: FIELD_OF_PATH })
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

type LoadedTreatmentForm =
  { status: 'ready'; values: TreatmentFormValues } | { status: 'not-resumable' }

/** Les valeurs d'un traitement relu ; un traitement ni terminé ni arrêté n'a rien à reprendre : retour à sa fiche. */
export function loadedFormValues(
  mode: 'edit' | 'resume',
  loaded: TreatmentWithHistory,
  today: string,
): LoadedTreatmentForm {
  if (mode === 'resume') {
    const { period, canResume } = resumptionDraft(loaded, today)
    if (!canResume) return { status: 'not-resumable' }
    return { status: 'ready', values: { ...treatmentFormValuesFrom(loaded, period), endsOn: '' } }
  }
  const first = editionDraftOf(emptyTreatmentFormValues(), loaded, today)
  return {
    status: 'ready',
    values: {
      ...treatmentFormValuesFrom(loaded, first.period),
      nextDoseOn: first.nextDose?.proposedOn ?? '',
      shiftsFollowing: first.nextDose?.shiftInitial ?? true,
    },
  }
}

/** Ce dont dépend une réponse de l'encart : changé, la réponse ne vaut plus (TR-3). */
export function pastDosesBasis(values: TreatmentFormValues, dues: readonly Due[]): string {
  const { firstDoseOn, frequencyValue, frequencyUnit, times, endsOn } = values
  return JSON.stringify([firstDoseOn, frequencyValue, frequencyUnit, times, endsOn, dues.length])
}
