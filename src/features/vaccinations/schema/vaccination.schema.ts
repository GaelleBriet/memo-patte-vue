import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

export const vaccinationInputSchema = z.object({
  animalId: z.uuid(),
  name: z.string().trim().min(1),
  lastInjectionDate: z.iso.date().refine((value) => !isFuture(parseISO(value))),
  dueDate: z.iso.date().nullable().default(null),
})

/** Le rattachement à l'animal est figé à la création. */
export const vaccinationUpdateSchema = vaccinationInputSchema.omit({ animalId: true })

export const vaccinationSchema = vaccinationInputSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Suppression logique : `null` tant que le vaccin existe. */
  deletedAt: z.iso.datetime().nullable(),
})

export type VaccinationInput = z.input<typeof vaccinationInputSchema>
export type VaccinationUpdateInput = z.input<typeof vaccinationUpdateSchema>
export type Vaccination = z.output<typeof vaccinationSchema>
