import type { z } from 'zod'

import { animalInputSchema, type Animal, type AnimalSpecies } from '../schema/animal.schema'
import { recordedWeightIn, weightKgFromInput } from '@/shared/domain/weight-unit'
import { currentWeightUnit } from '@/shared/domain/weight-unit-preference'

export interface AnimalFormValues {
  name: string
  species: AnimalSpecies | null
  breed: string
  birthDate: string
  /** Saisi dans l'unité choisie, enregistré en kg. */
  initialWeightKg: string
}

const ERROR_KEYS = {
  name: 'animals.form.errors.name',
  species: 'animals.form.errors.species',
  birthDate: 'animals.form.errors.birthDate',
  initialWeightKg: 'animals.form.errors.initialWeightKg',
} as const

const MAX_WEIGHT_KEY = 'animals.form.errors.initialWeightKgMax'

export type AnimalFormErrorField = keyof typeof ERROR_KEYS
export type AnimalFormErrors = Partial<Record<AnimalFormErrorField, string>>

export type AnimalFormResult =
  | { success: true; data: z.output<typeof animalInputSchema> }
  | { success: false; errors: AnimalFormErrors }

export function emptyAnimalFormValues(): AnimalFormValues {
  return { name: '', species: null, breed: '', birthDate: '', initialWeightKg: '' }
}

export function animalFormValuesFrom(animal: Animal): AnimalFormValues {
  return {
    name: animal.name,
    species: animal.species,
    breed: animal.breed ?? '',
    birthDate: animal.birthDate ?? '',
    initialWeightKg:
      animal.initialWeightKg === null
        ? ''
        : String(recordedWeightIn(animal.initialWeightKg, currentWeightUnit())),
  }
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim()

  return trimmed === '' ? null : trimmed
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim()

  return trimmed === '' ? null : Number(trimmed.replace(',', '.'))
}

function isErrorField(field: string): field is AnimalFormErrorField {
  return Object.prototype.hasOwnProperty.call(ERROR_KEYS, field)
}

function errorKeyFor(field: AnimalFormErrorField, issue: z.core.$ZodIssue): string {
  if (field === 'initialWeightKg' && issue.code === 'too_big') return MAX_WEIGHT_KEY

  return ERROR_KEYS[field]
}

/** `storedInitialWeightKg` : gardé tel quel si la valeur proposée n'a pas bougé. */
export function validateAnimalForm(
  values: AnimalFormValues,
  storedInitialWeightKg: number | null = null,
): AnimalFormResult {
  const result = animalInputSchema.safeParse({
    name: values.name,
    species: values.species,
    breed: textOrNull(values.breed),
    birthDate: textOrNull(values.birthDate),
    initialWeightKg: weightKgFromInput(
      numberOrNull(values.initialWeightKg),
      currentWeightUnit(),
      storedInitialWeightKg,
    ),
  })

  if (result.success) return { success: true, data: result.data }

  const errors: AnimalFormErrors = {}

  for (const issue of result.error.issues) {
    const field = String(issue.path[0])

    if (isErrorField(field)) errors[field] = errorKeyFor(field, issue)
  }

  return { success: false, errors }
}
