import { ref, type ComputedRef, type Ref } from 'vue'

import { isWrongPassword, WRONG_PASSWORD_KEY } from '../logic/account-error-message'

type Refusal<Field extends string> = { field: Field; value: string; key: string }

export function useFieldRefusal<Field extends string>(
  values: Ref<Record<Field, string>>,
  errors: ComputedRef<Partial<Record<Field, string>>>,
) {
  const refusal = ref<Refusal<Field> | null>(null) as Ref<Refusal<Field> | null>

  function fieldError(field: Field): string | null {
    const refused = refusal.value
    if (refused?.field === field && refused.value === values.value[field]) return refused.key
    return errors.value[field] ?? null
  }

  function refuse(field: Field, value: string, key: string): void {
    refusal.value = { field, value, key }
  }

  function refuseWrongPassword(cause: unknown, submittedCurrent: string): boolean {
    if (!isWrongPassword(cause)) return false
    refuse('current' as Field, submittedCurrent, WRONG_PASSWORD_KEY)
    return true
  }

  function clear(): void {
    refusal.value = null
  }

  return { fieldError, refuse, refuseWrongPassword, clear }
}
