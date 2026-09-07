import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

/** Espèces couvertes en v1 (cf. `docs/product/06-mvp-scope.md`). */
export const ANIMAL_SPECIES = ['dog', 'cat'] as const

export const animalSpeciesSchema = z.enum(ANIMAL_SPECIES)
export type AnimalSpecies = z.output<typeof animalSpeciesSchema>

/** Données saisissables d'un animal : tout ce qui ne dépend pas de la base. */
export const animalInputSchema = z.object({
  name: z.string().trim().min(1),
  species: animalSpeciesSchema,
  breed: z.string().trim().min(1).nullable().default(null),
  /** Date ISO `yyyy-MM-dd`, jamais dans le futur. */
  birthDate: z.iso
    .date()
    .refine((value) => !isFuture(parseISO(value)))
    .nullable()
    .default(null),
  initialWeightKg: z.number().positive().nullable().default(null),
  /** Nom du fichier photo sous `files/photos/` (cf. `docs/technical/01-architecture-v2.md`). */
  photoPath: z.string().trim().min(1).nullable().default(null),
})

/** Animal tel qu'il est persisté : identité et horodatages en plus. */
export const animalSchema = animalInputSchema.extend({
  id: z.uuid(),
  /** Horodatages ISO 8601 UTC, `updatedAt` sert d'arbitre à la synchronisation Plus. */
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

/** Ce que l'appelant fournit : les champs facultatifs peuvent être omis. */
export type AnimalInput = z.input<typeof animalInputSchema>
export type Animal = z.output<typeof animalSchema>
