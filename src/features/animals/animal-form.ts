import { format } from 'date-fns'
import type { z } from 'zod'

import { animalInputSchema, type Animal, type AnimalSpecies } from './animal.schema'

export interface AnimalFormValues {
  name: string
  species: AnimalSpecies | null
  breed: string
  birthDate: string
  initialWeightKg: string
}

const ERROR_KEYS = {
  name: 'animals.form.errors.name',
  species: 'animals.form.errors.species',
  birthDate: 'animals.form.errors.birthDate',
  initialWeightKg: 'animals.form.errors.initialWeightKg',
} as const

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
    initialWeightKg: animal.initialWeightKg === null ? '' : String(animal.initialWeightKg),
  }
}

export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
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

export function validateAnimalForm(values: AnimalFormValues): AnimalFormResult {
  const result = animalInputSchema.safeParse({
    name: values.name,
    species: values.species,
    breed: textOrNull(values.breed),
    birthDate: textOrNull(values.birthDate),
    initialWeightKg: numberOrNull(values.initialWeightKg),
  })

  if (result.success) return { success: true, data: result.data }

  const errors: AnimalFormErrors = {}

  for (const issue of result.error.issues) {
    const field = String(issue.path[0])

    if (isErrorField(field)) errors[field] = ERROR_KEYS[field]
  }

  return { success: false, errors }
}
