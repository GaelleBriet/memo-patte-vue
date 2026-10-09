import type { z } from 'zod'

import { animalCreationInputSchema, type Animal, type AnimalSpecies } from '../schema/animal.schema'
import { animalAgeText } from '@/shared/domain/animal-age'
import { exceedsMaxWeight, weightKgFromInput } from '@/shared/domain/weight-unit'
import { currentWeightUnit } from '@/core/preferences/weight-unit-preference'
import { fieldErrorsOf, type FieldErrorKeys } from '@/shared/form/field-errors'
import { numberOrNull } from '@/shared/form/number-input'
import type { Translate } from '@/core/i18n/translate'

export interface AnimalFormValues {
  name: string
  species: AnimalSpecies | null
  breed: string
  birthDate: string
  birthDateApproximate: boolean
  /** À la création seulement, dans l'unité choisie : il devient la première pesée, en kg. */
  weightKg: string
}

const MAX_WEIGHT_KEY = 'animals.form.errors.initialWeightKgMax'

const ERROR_KEYS = {
  name: { key: 'animals.form.errors.name', byCode: { too_big: 'animals.form.errors.nameMax' } },
  species: { key: 'animals.form.errors.species' },
  breed: { key: 'animals.form.errors.breedMax' },
  birthDate: { key: 'animals.form.errors.birthDate' },
  weightKg: { key: 'animals.form.errors.initialWeightKg', byCode: { too_big: MAX_WEIGHT_KEY } },
} as const satisfies Record<string, FieldErrorKeys>

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

export function withBirthDate(values: AnimalFormValues, birthDate: string): AnimalFormValues {
  const next = { ...values, birthDate }
  return canMarkBirthDateApproximate(next) ? next : { ...next, birthDateApproximate: false }
}

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

  const errors = fieldErrorsOf(result.error?.issues ?? [], ERROR_KEYS)

  return { success: false, errors: tooHeavy ? { weightKg: MAX_WEIGHT_KEY, ...errors } : errors }
}
