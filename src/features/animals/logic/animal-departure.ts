import { animalDepartureSchema, type AnimalDepartureInput } from '../schema/animal-departure.schema'
import type { DepartureReason } from '../schema/animal.schema'

export type DepartureFormValues = {
  departureReason: DepartureReason | null
  /** `yyyy-MM-dd`, ou vide. */
  departureDate: string
}

export type DepartureFormResult =
  | { success: true; data: AnimalDepartureInput }
  | { success: false; errors: { departureDate?: string } }

export function departureFormValuesFrom(departure: AnimalDepartureInput): DepartureFormValues {
  return {
    departureReason: departure.departureReason,
    departureDate: departure.departureDate ?? '',
  }
}

/** Q5 : « Ajouter une date » jusqu'au premier enregistrement, « Modifier la date » ensuite. */
export function hasDepartureDetails(departure: AnimalDepartureInput): boolean {
  return departure.departureReason !== null || departure.departureDate !== null
}

export function validateDepartureForm(
  values: DepartureFormValues,
  today: string,
): DepartureFormResult {
  const date = values.departureDate.trim()
  const result = animalDepartureSchema(today).safeParse({
    departureReason: values.departureReason,
    departureDate: date === '' ? null : date,
  })
  if (result.success) return { success: true, data: result.data }

  const isFuture = result.error.issues.some((issue) => issue.code === 'custom')
  return {
    success: false,
    errors: {
      departureDate: isFuture
        ? 'animals.departure.errors.future'
        : 'animals.departure.errors.invalid',
    },
  }
}
