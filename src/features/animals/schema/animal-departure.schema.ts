import { z } from 'zod'

import { isNotFuture } from '@/shared/domain/calendar-day'
import { departureReasonSchema } from './animal.schema'

/** AN-10 : motif et date du départ, facultatifs ; la date jamais après `today`. */
export function animalDepartureSchema(today: string) {
  return z.object({
    departureReason: departureReasonSchema.nullable(),
    departureDate: z.iso
      .date()
      .refine((date) => isNotFuture(date, today))
      .nullable(),
  })
}

export type AnimalDepartureInput = z.output<ReturnType<typeof animalDepartureSchema>>
