import { ref } from 'vue'

import { AccountError } from '../logic/account-error'
import { accountErrorKey, signInErrorKey } from '../logic/account-error-message'
import { validatePasswordChange, type PasswordChangeValues } from '../logic/password-change-form'
import { useAuthStore } from '../store/auth.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

type Field = keyof PasswordChangeValues

type Refusal = { field: Field; value: string; key: string }

const WRONG_PASSWORD_KEY = 'settings.account.delete.identity.wrongPassword'

/** « Changer mon mot de passe » (PL-10, V24 ter) : l'actuel, puis le nouveau. */
export function usePasswordChange() {
  const auth = useAuthStore()

  const values = ref<PasswordChangeValues>({ current: '', next: '' })
  const refusal = ref<Refusal | null>(null)
  const failureKey = ref<string | null>(null)
  const isSaving = ref(false)

  const { errors, validate } = useFormValidation(values, validatePasswordChange)

  function fieldError(field: Field): string | null {
    const refused = refusal.value
    if (refused?.field === field && refused.value === values.value[field]) return refused.key
    return errors.value[field] ?? null
  }

  function refuse(cause: unknown, data: PasswordChangeValues): void {
    const reason = cause instanceof AccountError ? cause.reason : 'unknown'
    if (reason === 'invalid-credentials') {
      refusal.value = { field: 'current', value: data.current, key: WRONG_PASSWORD_KEY }
    } else if (reason === 'same-password' || reason === 'weak-password') {
      refusal.value = { field: 'next', value: data.next, key: accountErrorKey(reason) }
    } else {
      failureKey.value = signInErrorKey(cause)
    }
  }

  async function save(): Promise<boolean> {
    if (isSaving.value) return false
    failureKey.value = null
    refusal.value = null
    const result = validate()
    if (!result.success) return false
    isSaving.value = true
    try {
      await auth.changePasswordWithCurrent(result.data.current, result.data.next)
      return true
    } catch (cause) {
      refuse(cause, result.data)
      return false
    } finally {
      isSaving.value = false
    }
  }

  return { values, fieldError, failureKey, isSaving, save }
}
