import { z } from 'zod'

import { treatmentFrequencySchema } from './treatment.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import { CLOCK_TIME_PATTERN, MAX_TIMES_PER_DAY } from '@/shared/domain/clock-time'
import { DOSE_UNITS, type DoseUnit } from '@/shared/domain/dosage'

export const treatmentPeriodSchema = z.object({
  id: z.uuid(),
  treatmentId: z.uuid(),
  animalId: z.uuid(),
  startsOn: z.iso.date(),
  firstDueOn: z.iso.date(),
  frequency: treatmentFrequencySchema,
  /** `null` tant que la période n'est pas arrêtée. */
  stoppedOn: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})

export type TreatmentPeriod = z.output<typeof treatmentPeriodSchema>

export const doseUnitSchema = z.enum(DOSE_UNITS)

export const REMINDER_OFFSETS_MINUTES = [0, 15, 30, 60] as const
export type ReminderOffsetMinutes = (typeof REMINDER_OFFSETS_MINUTES)[number]

/** La période avec toutes ses colonnes : ce que l'export emporte et que l'import écrit. */
export type TreatmentPeriodRecord = TreatmentPeriod & {
  /** Origine de la grille des échéances ; par défaut, la première échéance. */
  referenceOn: string
  endsOn: string | null
  /** Heures `HH:mm` de chaque jour d'échéance ; vide pour un traitement sans heure. */
  times: string[]
  doseQuantity: number | null
  doseUnit: DoseUnit | null
  reminderOffsetMinutes: ReminderOffsetMinutes | null
  reminderTime: string | null
}

/** Ce qu'un formulaire règle dans une période. */
export type TreatmentPeriodSettings = Pick<
  TreatmentPeriodRecord,
  | 'startsOn'
  | 'firstDueOn'
  | 'endsOn'
  | 'frequency'
  | 'times'
  | 'doseQuantity'
  | 'doseUnit'
  | 'reminderOffsetMinutes'
  | 'reminderTime'
>

export const calendarDaySchema = z.string().refine(isCalendarDay)
export const clockTimeSchema = z.string().regex(CLOCK_TIME_PATTERN)

export const treatmentTimesSchema = z
  .array(clockTimeSchema)
  .max(MAX_TIMES_PER_DAY)
  .refine((times) => new Set(times).size === times.length)

export const doseQuantitySchema = z.number().positive()

export function hasWholeDosage({
  doseQuantity,
  doseUnit,
}: Pick<TreatmentPeriodSettings, 'doseQuantity' | 'doseUnit'>): boolean {
  return (doseQuantity === null) === (doseUnit === null)
}

/** Garde de toute écriture d'une période : ce qu'elle laisse passer se réimporte. */
export const treatmentPeriodSettingsSchema = z
  .object({
    startsOn: calendarDaySchema,
    firstDueOn: calendarDaySchema,
    endsOn: calendarDaySchema.nullable(),
    frequency: treatmentFrequencySchema,
    times: treatmentTimesSchema,
    doseQuantity: doseQuantitySchema.nullable(),
    doseUnit: doseUnitSchema.nullable(),
    reminderOffsetMinutes: z.literal([...REMINDER_OFFSETS_MINUTES]).nullable(),
    reminderTime: clockTimeSchema.nullable(),
  })
  .refine(hasWholeDosage, { path: ['doseUnit'] })
  .refine(({ startsOn, firstDueOn }) => firstDueOn >= startsOn, { path: ['firstDueOn'] })
  .refine(({ firstDueOn, endsOn }) => endsOn === null || endsOn >= firstDueOn, {
    path: ['endsOn'],
  })
