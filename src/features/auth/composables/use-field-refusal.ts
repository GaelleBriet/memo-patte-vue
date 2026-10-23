import { ref, type ComputedRef, type Ref } from 'vue'

import { isWrongPassword, WRONG_PASSWORD_KEY } from '../logic/account-error-message'

type Refusal<Field extends string> = { field: Field; value: string; key: string }

type Key<Field extends string> = Field | 'current'

export function useFieldRefusal<Field extends string>(
  values: Ref<Record<Key<Field>, string>>,
  errors: ComputedRef<Partial<Record<Key<Field>, string>>>,
) {
  const refusal = ref<Refusal<Key<Field>> | null>(null) as Ref<Refusal<Key<Field>> | null>

  function fieldError(field: Key<Field>): string | null {
    const refused = refusal.value
    if (refused?.field === field && refused.value === values.value[field]) return refused.key
    return errors.value[field] ?? null
  }

  function refuse(field: Key<Field>, value: string, key: string): void {
    refusal.value = { field, value, key }
  }

  function refuseWrongPassword(cause: unknown, submittedCurrent: string): boolean {
    if (!isWrongPassword(cause)) return false
    refuse('current', submittedCurrent, WRONG_PASSWORD_KEY)
    return true
  }

  function clear(): void {
    refusal.value = null
  }

  return { fieldError, refuse, refuseWrongPassword, clear }
}
