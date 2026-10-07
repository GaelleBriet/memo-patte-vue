import type { z } from 'zod'

import { animalCreationInputSchema, type Animal, type AnimalSpecies } from '../schema/animal.schema'
import { animalAgeText } from '@/shared/domain/animal-age'
import { exceedsMaxWeight, weightKgFromInput } from '@/shared/domain/weight-unit'
import { currentWeightUnit } from '@/shared/domain/weight-unit-preference'

export interface AnimalFormValues {
  name: string
  species: AnimalSpecies | null
  breed: string
  birthDate: string
  birthDateApproximate: boolean
  /** À la création seulement, dans l'unité choisie : il devient la première pesée, en kg. */
  weightKg: string
}

const ERROR_KEYS = {
  name: 'animals.form.errors.name',
  species: 'animals.form.errors.species',
  breed: 'animals.form.errors.breedMax',
  birthDate: 'animals.form.errors.birthDate',
  weightKg: 'animals.form.errors.initialWeightKg',
} as const

const MAX_WEIGHT_KEY = 'animals.form.errors.initialWeightKgMax'
const MAX_NAME_KEY = 'animals.form.errors.nameMax'

export type AnimalFormErrorField = keyof typeof ERROR_KEYS
export type AnimalFormErrors = Partial<Record<AnimalFormErrorField, string>>

export type AnimalFormResult =
  | { success: true; data: z.output<typeof animalCreationInputSchema> }
  | { success: false; errors: AnimalFormErrors }

export function emptyAnimalFormValues(): AnimalFormValues {
  return {
    name: '',
    species: null,
    breed: '',
    birthDate: '',
    birthDateApproximate: false,
    weightKg: '',
  }
}

export function animalFormValuesFrom(animal: Animal): AnimalFormValues {
  return {
    name: animal.name,
    species: animal.species,
    breed: animal.breed ?? '',
    birthDate: animal.birthDate ?? '',
    birthDateApproximate: animal.birthDateApproximate,
    weightKg: '',
  }
}

export function canMarkBirthDateApproximate(values: AnimalFormValues): boolean {
  return values.birthDate.trim() !== ''
}

type Translate = (key: string, named: Record<string, unknown>, plural: number) => string

export function birthDateApproximateHelp(
  t: Translate,
  values: AnimalFormValues,
  today: string,
): string | null {
  if (!canMarkBirthDateApproximate(values)) {
    return t('animals.form.birthDate.approximate.unavailable', {}, 1)
  }
  if (!values.birthDateApproximate) return null

  const age = animalAgeText(t, { birthDate: values.birthDate, approximate: true }, today)
  return t('animals.form.birthDate.approximate.willShow', { age }, 1)
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
  if (field === 'weightKg' && issue.code === 'too_big') return MAX_WEIGHT_KEY
  if (field === 'name' && issue.code === 'too_big') return MAX_NAME_KEY

  return ERROR_KEYS[field]
}

export function validateAnimalForm(values: AnimalFormValues): AnimalFormResult {
  const typed = numberOrNull(values.weightKg)
  const unit = currentWeightUnit()
  const result = animalCreationInputSchema.safeParse({
    name: values.name,
    species: values.species,
    breed: textOrNull(values.breed),
    birthDate: textOrNull(values.birthDate),
    birthDateApproximate: canMarkBirthDateApproximate(values) && values.birthDateApproximate,
    weightKg: weightKgFromInput(typed, unit, null),
  })
  const tooHeavy = exceedsMaxWeight(typed, unit, null)

  if (result.success && !tooHeavy) return { success: true, data: result.data }

  const errors: AnimalFormErrors = tooHeavy ? { weightKg: MAX_WEIGHT_KEY } : {}

  for (const issue of result.error?.issues ?? []) {
    const field = String(issue.path[0])

    if (isErrorField(field)) errors[field] = errorKeyFor(field, issue)
  }

  return { success: false, errors }
}
