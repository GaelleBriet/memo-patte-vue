import { computed, ref, type ComputedRef, type Ref } from 'vue'

export type FormValidationResult<D, E> = { success: true; data: D } | { success: false; errors: E }

export interface FormValidation<D, E> {
  errors: ComputedRef<Partial<E>>
  validate: () => FormValidationResult<D, E>
  reset: () => void
}

/**
 * Erreurs de champs d'un formulaire : rien avant le premier envoi, puis
 * recalculées à chaque saisie avec la même fonction de validation.
 */
export function useFormValidation<V, D, E extends object>(
  values: Ref<V>,
  validateValues: (values: V) => FormValidationResult<D, E>,
): FormValidation<D, E> {
  const submitted = ref(false)

  const errors = computed((): Partial<E> => {
    if (!submitted.value) return {}

    const result = validateValues(values.value)
    return result.success ? {} : result.errors
  })

  function validate(): FormValidationResult<D, E> {
    submitted.value = true
    return validateValues(values.value)
  }

  function reset(): void {
    submitted.value = false
  }

  return { errors, validate, reset }
}
