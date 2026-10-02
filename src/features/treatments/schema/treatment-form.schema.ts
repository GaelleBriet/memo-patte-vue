import { z } from 'zod'

import {
  calendarDaySchema,
  doseQuantitySchema,
  doseUnitSchema,
  hasWholeDosage,
  treatmentTimesSchema,
} from './treatment-period.schema'
import {
  treatmentFrequencySchema,
  treatmentInputSchema,
  treatmentTypeSchema,
} from './treatment.schema'

const identity = {
  name: treatmentInputSchema.shape.name,
  type: treatmentTypeSchema,
}

const rhythm = {
  frequency: treatmentFrequencySchema,
  times: treatmentTimesSchema,
  doseQuantity: doseQuantitySchema.nullable(),
  doseUnit: doseUnitSchema.nullable(),
  endsOn: calendarDaySchema.nullable(),
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

/** Création : la première prise peut être passée, du jour ou future ; rien n'est noté comme donné. */
export const treatmentCreationSchema = z
  .object({ animalId: z.uuid(), ...identity, firstDoseOn: calendarDaySchema, ...rhythm })
  .refine(hasWholeDosage, WHOLE_DOSAGE)
  .refine(endsAfterFirstDose, END_AFTER_FIRST_DOSE)

/** « Modifier » : `nextDoseOn` vaut `null` quand « Prochaine dose » garde la date proposée. */
export const treatmentEditionSchema = z
  .object({ ...identity, ...rhythm, nextDoseOn: calendarDaySchema.nullable() })
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
