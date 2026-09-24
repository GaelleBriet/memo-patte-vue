import { z } from 'zod'

export const vaccinationInjectionSchema = z.object({
  id: z.uuid(),
  vaccinationId: z.uuid(),
  animalId: z.uuid(),
  injectedOn: z.iso.date(),
  /** Rappel choisi ce jour-là : `null` pour « Pas de rappel ». */
  nextDueDate: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})

export type VaccinationInjection = z.output<typeof vaccinationInjectionSchema>
