import { z } from 'zod'

import {
  calendarDaySchema,
  clockTimeSchema,
  doseQuantitySchema,
  doseUnitSchema,
  hasWholeDosage,
  REMINDER_OFFSETS_MINUTES,
  treatmentTimesSchema,
} from './treatment-period.schema'
import {
  treatmentFrequencySchema,
  treatmentNameSchema,
  treatmentTypeSchema,
} from './treatment.schema'

const identity = {
  name: treatmentNameSchema,
  type: treatmentTypeSchema,
}

const rhythm = {
  frequency: treatmentFrequencySchema,
  times: treatmentTimesSchema,
  doseQuantity: doseQuantitySchema.nullable(),
  doseUnit: doseUnitSchema.nullable(),
  endsOn: calendarDaySchema.nullable(),
  /** Absents, la période garde son rappel ; `null`, le rappel par défaut (RA-7, RA-8). */
  reminderOffsetMinutes: z
    .literal([...REMINDER_OFFSETS_MINUTES])
    .nullable()
    .optional(),
  reminderTime: clockTimeSchema.nullable().optional(),
}

const WHOLE_DOSAGE = { path: ['doseUnit'], message: 'incomplete' }
const END_AFTER_FIRST_DOSE = { path: ['endsOn'], message: 'beforeFirstDose' }

function endsAfterFirstDose({
  firstDoseOn,
  endsOn,
}: {
  firstDoseOn: string
  endsOn: string | null
}): boolean {
  return endsOn === null || endsOn >= firstDoseOn
}

/** Ce qu'un formulaire règle dans une période, hors ses dates de début et de première échéance. */
export const treatmentRhythmSchema = z.object(rhythm).refine(hasWholeDosage, WHOLE_DOSAGE)

/** Ce qui fait le calendrier d'un traitement en cours de saisie. */
export const treatmentCalendarSchema = z.object({
  firstDoseOn: calendarDaySchema,
  frequency: treatmentFrequencySchema,
  times: treatmentTimesSchema,
  endsOn: calendarDaySchema.nullable(),
})
export type TreatmentCalendarInput = z.input<typeof treatmentCalendarSchema>

/** Une échéance passée renseignée dans l'encart de création (TR-3). */
export const pastDoseSchema = z.object({
  dueOn: calendarDaySchema,
  dueTime: clockTimeSchema.nullable(),
  status: z.enum(['given', 'missed']),
})
export type PastDose = z.output<typeof pastDoseSchema>

/** Création : la première prise peut être passée, du jour ou future ; seules les `pastDoses` sont notées. */
export const treatmentCreationSchema = z
  .object({
    animalId: z.uuid(),
    ...identity,
    firstDoseOn: calendarDaySchema,
    ...rhythm,
    pastDoses: z.array(pastDoseSchema).optional(),
  })
  .refine(hasWholeDosage, WHOLE_DOSAGE)
  .refine(endsAfterFirstDose, END_AFTER_FIRST_DOSE)

/** Échéances tombées d'une période sans prise dont le rythme change : à renseigner, ou jamais dues. */
export const pastDuesChoiceSchema = z.enum(['keep', 'drop'])
export type PastDuesChoice = z.output<typeof pastDuesChoiceSchema>

/** « Modifier » : `nextDoseOn` vaut `null` quand « Prochaine dose » garde la date proposée. */
export const treatmentEditionSchema = z
  .object({
    ...identity,
    ...rhythm,
    nextDoseOn: calendarDaySchema.nullable(),
    /** La case « Décaler aussi les doses suivantes », cochée par défaut. */
    shiftsFollowing: z.boolean().optional(),
    pastDues: pastDuesChoiceSchema.optional(),
  })
  .refine(hasWholeDosage, WHOLE_DOSAGE)

/** « Reprendre » : ni nom ni type, la première prise est demandée. */
export const treatmentResumptionSchema = z
  .object({ firstDoseOn: calendarDaySchema, ...rhythm })
  .refine(hasWholeDosage, WHOLE_DOSAGE)
  .refine(endsAfterFirstDose, END_AFTER_FIRST_DOSE)

export type TreatmentRhythm = z.output<typeof treatmentRhythmSchema>
export type TreatmentCreationInput = z.input<typeof treatmentCreationSchema>
export type TreatmentEditionInput = z.input<typeof treatmentEditionSchema>
export type TreatmentResumptionInput = z.input<typeof treatmentResumptionSchema>
