import { computed, ref, type ComputedRef, type Ref } from 'vue'

export type FormValidationResult<D, E> = { success: true; data: D } | { success: false; errors: E }

type ErrorsOf<R> = R extends { success: false; errors: infer E } ? E : never

export interface FormValidation<R extends FormValidationResult<unknown, object>> {
  errors: ComputedRef<Partial<ErrorsOf<R>>>
  validate: () => R
  reset: () => void
}

/**
 * Erreurs de champs d'un formulaire : rien avant le premier envoi, puis
 * recalculées à chaque saisie avec la même fonction de validation, dont
 * `validate` rend le résultat tel quel.
 */
export function useFormValidation<V, R extends FormValidationResult<unknown, object>>(
  values: Ref<V>,
  validateValues: (values: V) => R,
): FormValidation<R> {
  const submitted = ref(false)

  const errors = computed((): Partial<ErrorsOf<R>> => {
    if (!submitted.value) return {}

    const result = validateValues(values.value)
    return result.success ? {} : (result.errors as ErrorsOf<R>)
  })

  function validate(): R {
    submitted.value = true
    return validateValues(values.value)
  }

  function reset(): void {
    submitted.value = false
  }

  return { errors, validate, reset }
}
