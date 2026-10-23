import { ref } from 'vue'

import { AccountError } from '../logic/account-error'
import { accountErrorKey, signInErrorKey } from '../logic/account-error-message'
import { validatePasswordChange, type PasswordChangeValues } from '../logic/password-change-form'
import { useAuthStore } from '../store/auth.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

import { useFieldRefusal } from './use-field-refusal'

/** « Changer mon mot de passe » (PL-10, V24 ter) : l'actuel, puis le nouveau. */
export function usePasswordChange() {
  const auth = useAuthStore()

  const values = ref<PasswordChangeValues>({ current: '', next: '' })
  const failureKey = ref<string | null>(null)
  const isSaving = ref(false)

  const { errors, validate } = useFormValidation(values, validatePasswordChange)

  const refusal = useFieldRefusal(values, errors)

  function refuse(cause: unknown, data: PasswordChangeValues): void {
    const reason = cause instanceof AccountError ? cause.reason : 'unknown'
    if (refusal.refuseWrongPassword(cause, data.current)) return
    if (reason === 'same-password' || reason === 'weak-password') {
      refusal.refuse('next', data.next, accountErrorKey(reason))
    } else {
      failureKey.value = signInErrorKey(cause)
    }
  }

  async function save(): Promise<boolean> {
    if (isSaving.value) return false
    failureKey.value = null
    refusal.clear()
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

  return { values, fieldError: refusal.fieldError, failureKey, isSaving, save }
}
