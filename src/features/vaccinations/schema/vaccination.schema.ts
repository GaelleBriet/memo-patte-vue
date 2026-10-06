import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

export const injectionDateSchema = z.iso.date().refine((value) => !isFuture(parseISO(value)))
export const dueDateSchema = z.iso.date().nullable().default(null)

const vaccinationFields = z.object({
  animalId: z.uuid(),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  lastInjectionDate: injectionDateSchema.nullable().default(null),
  dueDate: dueDateSchema,
})

/** Un vaccin a toujours une injection ou un prochain rappel. */
export const vaccinationInputSchema = vaccinationFields.refine(
  ({ lastInjectionDate, dueDate }) => lastInjectionDate !== null || dueDate !== null,
  { path: ['dueDate'] },
)

/** Le rattachement à l'animal est figé ; les dates d'injection se changent dans l'historique. */
export const vaccinationUpdateSchema = vaccinationFields.pick({ name: true, dueDate: true })

export const vaccinationSchema = vaccinationFields.extend({
  /** `null` pour un vaccin encore sans injection : `dueDate` est alors son rappel prévu. */
  lastInjectionDate: z.iso.date().nullable(),
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Suppression logique : `null` tant que le vaccin existe. */
  deletedAt: z.iso.datetime().nullable(),
})

export type VaccinationInput = z.input<typeof vaccinationInputSchema>
export type VaccinationUpdateInput = z.input<typeof vaccinationUpdateSchema>
export type Vaccination = z.output<typeof vaccinationSchema>
