import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

export const TREATMENT_TYPES = ['deworming', 'antiparasitic'] as const
export const FREQUENCY_UNITS = ['day', 'week', 'month'] as const

export const treatmentTypeSchema = z.enum(TREATMENT_TYPES)
export type TreatmentType = z.output<typeof treatmentTypeSchema>

export const frequencyUnitSchema = z.enum(FREQUENCY_UNITS)
export type FrequencyUnit = z.output<typeof frequencyUnitSchema>

export const treatmentFrequencySchema = z.object({
  value: z.number().int().positive(),
  unit: frequencyUnitSchema,
})
export type TreatmentFrequency = z.output<typeof treatmentFrequencySchema>

/** L'échéance n'en fait pas partie : le repository la calcule à partir de la dernière prise et de la fréquence. */
export const treatmentInputSchema = z.object({
  animalId: z.uuid(),
  name: z.string().trim().min(1),
  type: treatmentTypeSchema,
  frequency: treatmentFrequencySchema,
  lastDoseDate: z.iso.date().refine((value) => !isFuture(parseISO(value))),
})

/** Le rattachement à l'animal est figé à la création. */
export const treatmentUpdateSchema = treatmentInputSchema.omit({ animalId: true })

export const treatmentSchema = treatmentInputSchema.extend({
  id: z.uuid(),
  nextDueDate: z.iso.date(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Suppression logique : `null` tant que le traitement existe. */
  deletedAt: z.iso.datetime().nullable(),
})

export type TreatmentInput = z.input<typeof treatmentInputSchema>
export type TreatmentUpdateInput = z.input<typeof treatmentUpdateSchema>
export type Treatment = z.output<typeof treatmentSchema>
