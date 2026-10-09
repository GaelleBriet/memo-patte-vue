import type { z } from 'zod'

import { weightEntryInputSchema, type WeightEntry } from '../schema/weight.schema'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { exceedsMaxWeight, recordedWeightIn, weightKgFromInput } from '@/shared/domain/weight-unit'
import { currentWeightUnit } from '@/core/preferences/weight-unit-preference'
import { fieldErrorsOf, type FieldErrorKeys } from '@/shared/form/field-errors'
import { numberOrNull } from '@/shared/form/number-input'
import { formatWeightInput } from '@/shared/utils/format'

export interface WeightFormValues {
  /** `null` tant que l'animal n'est ni donné par le contexte ni choisi dans la feuille. */
  animalId: string | null
  /** Saisi dans l'unité choisie, enregistré en kg. */
  weightKg: string
  measuredOn: string
}

const ANIMAL_KEY = 'weight.form.errors.animalId'
const MAX_WEIGHT_KEY = 'weight.form.errors.weightKgMax'

// Le seul `refine` du schéma est la borne « pas dans le futur » : c'est lui qui émet `custom`.
const ERROR_KEYS = {
  animalId: { key: ANIMAL_KEY },
  weightKg: { key: 'weight.form.errors.weightKg', byCode: { too_big: MAX_WEIGHT_KEY } },
  measuredOn: {
    key: 'weight.form.errors.measuredOn',
    byCode: { custom: 'weight.form.errors.measuredOnFuture' },
  },
} as const satisfies Record<string, FieldErrorKeys>

export type WeightFormErrorField = keyof typeof ERROR_KEYS
export type WeightFormErrors = Partial<Record<WeightFormErrorField, string>>

export type WeightFormResult =
  | { success: true; data: z.output<typeof weightEntryInputSchema> }
  | { success: false; errors: WeightFormErrors }

/** La date est pré-remplie à aujourd'hui : la feuille tient sa promesse des deux taps. */
export function emptyWeightFormValues(animalId: string | null = null): WeightFormValues {
  return { animalId, weightKg: '', measuredOn: todayIsoDate() }
}

export function weightFormValuesFrom(entry: WeightEntry): WeightFormValues {
  return {
    animalId: entry.animalId,
    weightKg: formatWeightInput(recordedWeightIn(entry.weightKg, currentWeightUnit())),
    measuredOn: entry.measuredOn,
  }
}

/** `storedWeightKg` : poids de la pesée corrigée, gardé tel quel si la valeur proposée n'a pas bougé. */
export function validateWeightForm(
  values: WeightFormValues,
  storedWeightKg: number | null = null,
): WeightFormResult {
  // Sans animal, la feuille verrouille le poids et la date : leurs erreurs ne pourraient pas être corrigées.
  if (values.animalId === null) return { success: false, errors: { animalId: ANIMAL_KEY } }

  const typed = numberOrNull(values.weightKg)
  const unit = currentWeightUnit()
  const result = weightEntryInputSchema.safeParse({
    animalId: values.animalId,
    weightKg: weightKgFromInput(typed, unit, storedWeightKg),
    measuredOn: values.measuredOn.trim(),
  })
  const tooHeavy = exceedsMaxWeight(typed, unit, storedWeightKg)

  if (result.success && !tooHeavy) return { success: true, data: result.data }

  const errors = fieldErrorsOf(result.error?.issues ?? [], ERROR_KEYS)

  return { success: false, errors: tooHeavy ? { ...errors, weightKg: MAX_WEIGHT_KEY } : errors }
}
