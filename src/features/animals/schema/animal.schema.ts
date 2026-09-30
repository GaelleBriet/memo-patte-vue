import { isFuture, parseISO } from 'date-fns'
import { z } from 'zod'

import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'
import { MAX_WEIGHT_KG } from '@/shared/domain/weight-bounds'

export const ANIMAL_SPECIES = ['dog', 'cat'] as const

export const animalSpeciesSchema = z.enum(ANIMAL_SPECIES)
export type AnimalSpecies = z.output<typeof animalSpeciesSchema>

export const animalInputSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  species: animalSpeciesSchema,
  breed: z.string().trim().min(1).max(MAX_NAME_LENGTH).nullable().default(null),
  birthDate: z.iso
    .date()
    .refine((value) => !isFuture(parseISO(value)))
    .nullable()
    .default(null),
  initialWeightKg: z.number().positive().max(MAX_WEIGHT_KG).nullable().default(null),
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
