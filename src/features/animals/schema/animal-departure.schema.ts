import { z } from 'zod'

import { departureReasonSchema } from './animal.schema'

/** AN-10 : motif et date du départ, facultatifs ; la date jamais après `today`. */
export function animalDepartureSchema(today: string) {
  return z.object({
    departureReason: departureReasonSchema.nullable(),
    departureDate: z.iso
      .date()
      .refine((date) => date <= today)
      .nullable(),
  })
}

export type AnimalDepartureInput = z.output<ReturnType<typeof animalDepartureSchema>>
