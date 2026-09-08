import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

/** Données saisissables d'un vaccin : tout ce qui ne dépend pas de la base. */
export const vaccinationInputSchema = z.object({
  /**
   * Animal auquel le vaccin est rattaché. Le type reste local : les features ne
   * s'importent pas entre elles, l'intégrité est garantie par la clé étrangère.
   */
  animalId: z.uuid(),
  /** Nom du vaccin tel que noté sur le carnet (« CHPPi », « Typhus (RCP) »…). */
  name: z.string().trim().min(1),
  /** Date de dernière injection, ISO `yyyy-MM-dd`, jamais dans le futur. */
  lastInjectionDate: z.iso.date().refine((value) => !isFuture(parseISO(value))),
  /** Date d'échéance, ISO `yyyy-MM-dd` : `null` quand aucune échéance n'est connue. */
  dueDate: z.iso.date().nullable().default(null),
})

/** Vaccin tel qu'il est persisté : identité et horodatages en plus. */
export const vaccinationSchema = vaccinationInputSchema.extend({
  id: z.uuid(),
  /** Horodatages ISO 8601 UTC, `updatedAt` sert d'arbitre à la synchronisation Plus. */
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /**
   * Suppression logique : `null` tant que le vaccin existe, date ISO 8601 UTC
   * sinon. Les suppressions doivent pouvoir se propager entre appareils Plus.
   */
  deletedAt: z.iso.datetime().nullable(),
})

/** Ce que l'appelant fournit : les champs facultatifs peuvent être omis. */
export type VaccinationInput = z.input<typeof vaccinationInputSchema>
export type Vaccination = z.output<typeof vaccinationSchema>
