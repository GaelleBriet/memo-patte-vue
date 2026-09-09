import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

export const weightEntryInputSchema = z.object({
  animalId: z.uuid(),
  weightKg: z.number().positive(),
  /** Date civile locale (yyyy-MM-dd) : une pesée passée est autorisée, jamais future. */
  measuredOn: z.iso.date().refine((value) => !isFuture(parseISO(value))),
})

/** Le rattachement à l'animal est figé à la création. */
export const weightEntryUpdateSchema = weightEntryInputSchema.omit({ animalId: true })

export const weightEntrySchema = weightEntryInputSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Suppression logique : `null` tant que la pesée existe. */
  deletedAt: z.iso.datetime().nullable(),
})

export type WeightEntryInput = z.input<typeof weightEntryInputSchema>
export type WeightEntryUpdateInput = z.input<typeof weightEntryUpdateSchema>
export type WeightEntry = z.output<typeof weightEntrySchema>
