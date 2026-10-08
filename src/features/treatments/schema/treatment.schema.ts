import { z } from 'zod'

import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'
import { FREQUENCY_UNITS, MAX_FREQUENCY_VALUE } from '@/shared/domain/treatment-frequency'

export const TREATMENT_TYPES = ['deworming', 'antiparasitic', 'medication'] as const

export { FREQUENCY_UNITS }

export const treatmentTypeSchema = z.enum(TREATMENT_TYPES)
export type TreatmentType = z.output<typeof treatmentTypeSchema>

export const frequencyUnitSchema = z.enum(FREQUENCY_UNITS)
export type FrequencyUnit = z.output<typeof frequencyUnitSchema>

export const treatmentFrequencySchema = z.object({
  value: z.number().int().positive().max(MAX_FREQUENCY_VALUE),
  unit: frequencyUnitSchema,
})
export type TreatmentFrequency = z.output<typeof treatmentFrequencySchema>

/** Ce que le traitement lu porte de son plan ; le formulaire a ses schémas dans `treatment-form.schema.ts`. */
export const treatmentInputSchema = z.object({
  animalId: z.uuid(),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  type: treatmentTypeSchema,
  frequency: treatmentFrequencySchema,
})

/** Le traitement et sa période en cours ; ses échéances se lisent par le moteur, jamais ici. */
export const treatmentSchema = treatmentInputSchema.extend({
  id: z.uuid(),
  periodId: z.uuid(),
  /** `null` tant que la période en cours n'est pas arrêtée. */
  stoppedOn: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Suppression logique : `null` tant que le traitement existe. */
  deletedAt: z.iso.datetime().nullable(),
})

export type TreatmentInput = z.input<typeof treatmentInputSchema>
export type Treatment = z.output<typeof treatmentSchema>
