import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

export const ANIMAL_SPECIES = ['dog', 'cat'] as const

export const animalSpeciesSchema = z.enum(ANIMAL_SPECIES)
export type AnimalSpecies = z.output<typeof animalSpeciesSchema>

export const animalInputSchema = z.object({
  name: z.string().trim().min(1),
  species: animalSpeciesSchema,
  breed: z.string().trim().min(1).nullable().default(null),
  birthDate: z.iso
    .date()
    .refine((value) => !isFuture(parseISO(value)))
    .nullable()
    .default(null),
  initialWeightKg: z.number().positive().nullable().default(null),
  /** Nom de fichier sous `files/photos/`, jamais un chemin ni une URL. */
  photoPath: z.string().trim().min(1).nullable().default(null),
})

export const animalSchema = animalInputSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Suppression logique : `null` tant que l'animal existe. */
  deletedAt: z.iso.datetime().nullable(),
})

export type AnimalInput = z.input<typeof animalInputSchema>
export type Animal = z.output<typeof animalSchema>
