import { computed, ref } from 'vue'

import { AccountError } from '../logic/account-error'
import { accountErrorKey, signInErrorKey } from '../logic/account-error-message'
import { validateEmailChange, type EmailChangeValues } from '../logic/email-change-form'
import { useAuthStore } from '../store/auth.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

import { useEmailCode } from './use-email-code'

type Field = keyof EmailChangeValues

type Refusal = { field: Field; value: string; key: string }

const WRONG_PASSWORD_KEY = 'settings.account.delete.identity.wrongPassword'

/** « Changer mon adresse e-mail » (PL-10, V24 quater à sexies) : le mot de passe, la nouvelle adresse, son code. */
export function useEmailChange({ now = Date.now }: { now?: () => number } = {}) {
  const auth = useAuthStore()
  const emailCode = useEmailCode({
    now,
    operations: {
      resend: (address) => auth.resendEmailChangeCode(address),
      verify: (address, code) => auth.verifyEmailChangeCode(address, code),
    },
  })

  const values = ref<EmailChangeValues>({ current: '', email: '' })
  const refusal = ref<Refusal | null>(null)
  const failureKey = ref<string | null>(null)
  const isSending = ref(false)

  const { errors, validate, reset } = useFormValidation(values, validateEmailChange)

  const step = computed(() => (emailCode.email.value === null ? 'address' : 'code'))

  function fieldError(field: Field): string | null {
    const refused = refusal.value
    if (refused?.field === field && refused.value === values.value[field]) return refused.key
    return errors.value[field] ?? null
  }

  function refuse(cause: unknown, data: EmailChangeValues): void {
    const reason = cause instanceof AccountError ? cause.reason : 'unknown'
    if (reason === 'invalid-credentials') {
      refusal.value = { field: 'current', value: data.current, key: WRONG_PASSWORD_KEY }
    } else if (reason === 'email-taken' || reason === 'email-rate-limited') {
      refusal.value = { field: 'email', value: values.value.email, key: accountErrorKey(reason) }
    } else {
      failureKey.value = signInErrorKey(cause)
    }
  }

  async function sendCode(): Promise<boolean> {
    if (isSending.value) return false
    failureKey.value = null
    refusal.value = null
    const result = validate()
    if (!result.success) return false
    isSending.value = true
    try {
      await auth.requestEmailChange(result.data.current, result.data.email)
      emailCode.afterCodeSent(result.data.email)
      return true
    } catch (cause) {
      refuse(cause, result.data)
      return false
    } finally {
      isSending.value = false
    }
  }

  function backToAddress(): void {
    values.value = { current: '', email: emailCode.close().email }
    refusal.value = null
    failureKey.value = null
    reset()
  }

  return { emailCode, step, values, fieldError, failureKey, isSending, sendCode, backToAddress }
}
