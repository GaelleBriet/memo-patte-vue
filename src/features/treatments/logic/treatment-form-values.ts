import { parseDoseQuantity } from './treatment-dosage-input'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { treatmentRhythmSchema, type TreatmentRhythm } from '../schema/treatment-form.schema'
import type {
  ReminderOffsetMinutes,
  TreatmentPeriodRecord,
} from '../schema/treatment-period.schema'
import type { FrequencyUnit, TreatmentType } from '../schema/treatment.schema'
import { sortedTimes } from '@/shared/domain/clock-time'
import { formatDoseQuantity, type DoseUnit } from '@/shared/domain/dosage'

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

export function rhythmInput(values: TreatmentFormValues) {
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
