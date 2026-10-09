import type { z } from 'zod'

import { creationPastDues, treatmentCreationSchemaFor } from './treatment-creation'
import { editionDraft, treatmentEditionSchemaFor, type EditionDraft } from './treatment-edition'
import { resumptionDraft, treatmentResumptionSchemaFor } from './treatment-resumption'
import { parseDoseQuantity } from './treatment-dosage-input'
import {
  treatmentFormErrorsOf,
  treatmentFormResultOf,
  type TreatmentFormErrors,
  type TreatmentFormResult,
} from './treatment-form-errors'
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
import type { Due } from '@/shared/domain/treatment-schedule'

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

export type TreatmentCreationResult = TreatmentFormResult<
  z.output<ReturnType<typeof treatmentCreationSchemaFor>>
>
export type TreatmentEditionResult =
  | { success: true; data: z.output<ReturnType<typeof treatmentEditionSchemaFor>> }
  | { success: false; errors: TreatmentFormErrors; needsPastDuesChoice: boolean }
export type TreatmentResumptionResult = TreatmentFormResult<
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

/** `pastDoses` : la réponse de l'encart des doses passées, `null` s'il n'est pas rempli. */
export function validateTreatmentCreation(
  values: TreatmentFormValues,
  animalId: string,
  today: string,
  pastDoses: PastDose[] | null = null,
): TreatmentCreationResult {
  return treatmentFormResultOf(
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
    errors: treatmentFormErrorsOf(result.error.issues),
    needsPastDuesChoice: result.error.issues.every(({ path }) => path[0] === 'pastDues'),
  }
}

export function validateTreatmentResumption(
  values: TreatmentFormValues,
  history: TreatmentWithHistory,
  today: string,
): TreatmentResumptionResult {
  return treatmentFormResultOf(
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
