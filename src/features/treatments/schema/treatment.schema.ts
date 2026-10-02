import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'
import { MAX_FREQUENCY_VALUE } from '@/shared/domain/treatment-frequency'

export const TREATMENT_TYPES = ['deworming', 'antiparasitic', 'medication'] as const
export const FREQUENCY_UNITS = ['day', 'week', 'month'] as const

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
  lastDoseDate: z.iso.date().refine((value) => !isFuture(parseISO(value))),
})

/**
 * Le traitement et sa période en cours, avec la dernière prise et la prochaine dose qu'elle fixe ;
 * sans prise, la prochaine dose est la première échéance de la période.
 */
export const treatmentSchema = treatmentInputSchema.extend({
  id: z.uuid(),
  periodId: z.uuid(),
  lastDoseDate: z.iso.date().nullable(),
  nextDueDate: z.iso.date(),
  /** `null` tant que la période en cours n'est pas arrêtée. */
  stoppedOn: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Suppression logique : `null` tant que le traitement existe. */
  deletedAt: z.iso.datetime().nullable(),
})

export type TreatmentInput = z.input<typeof treatmentInputSchema>
export type Treatment = z.output<typeof treatmentSchema>
