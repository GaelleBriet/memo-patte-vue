import { ref } from 'vue'

import { AccountError } from '../logic/account-error'
import { accountErrorKey, signInErrorKey } from '../logic/account-error-message'
import {
  validatePasswordChange,
  type PasswordChange,
  type PasswordChangeValues,
} from '../logic/password-change-form'
import { useAuthStore } from '../store/auth.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

import { useFieldRefusal } from './use-field-refusal'
import { usePasswordConfirmation } from './use-password-confirmation'

/** « Changer mon mot de passe » (PL-10, V24 ter) : l'actuel, puis le nouveau deux fois. */
export function usePasswordChange() {
  const auth = useAuthStore()

  const values = ref<PasswordChangeValues>({ current: '', next: '', confirmation: '' })
  const failureKey = ref<string | null>(null)
  const isSaving = ref(false)

  const { errors, validate } = useFormValidation(values, validatePasswordChange)

  const refusal = useFieldRefusal(values, errors)
  const confirmation = usePasswordConfirmation(
    () => values.value.next,
    () => values.value.confirmation,
    () => errors.value.confirmation,
  )

  function fieldError(field: keyof PasswordChangeValues): string | null {
    return field === 'confirmation' ? confirmation.error.value : refusal.fieldError(field)
  }

  function refuse(cause: unknown, data: PasswordChange): void {
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

  return {
    values,
    fieldError,
    isConfirmed: confirmation.isConfirmed,
    leaveConfirmation: confirmation.leave,
    failureKey,
    isSaving,
    save,
  }
}
