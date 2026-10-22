import { ref } from 'vue'

import { AccountError } from '../logic/account-error'
import { accountErrorKey, signInErrorKey } from '../logic/account-error-message'
import { validateEmailChange, type EmailChangeValues } from '../logic/email-change-form'
import { useAuthStore } from '../store/auth.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

import { useEmailCode } from './use-email-code'

export type EmailChangeStep = 'address' | 'current' | 'new'

type Field = keyof EmailChangeValues

type Refusal = { field: Field; value: string; key: string }

const WRONG_PASSWORD_KEY = 'settings.account.delete.identity.wrongPassword'

/** « Changer mon adresse e-mail » (PL-10, V24 quater à sexies) : le mot de passe, la nouvelle adresse, puis le code de chaque adresse. */
export function useEmailChange({
  now = Date.now,
  accountEmail = () => null,
}: { now?: () => number; accountEmail?: () => string | null } = {}) {
  const auth = useAuthStore()
  let accountChanged = false
  let newAddress = ''
  const step = ref<EmailChangeStep>('address')

  const emailCode = useEmailCode({
    now,
    operations: {
      resend: () => auth.resendEmailChangeCode(),
      verify: async (address, code) => {
        accountChanged = await auth.verifyEmailChangeCode(address, code, step.value === 'new')
      },
    },
  })

  const values = ref<EmailChangeValues>({ current: '', email: '' })
  const refusal = ref<Refusal | null>(null)
  const failureKey = ref<string | null>(null)
  const isSending = ref(false)

  const { errors, validate, reset } = useFormValidation(values, (current) =>
    validateEmailChange(current, accountEmail()),
  )

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
      const current = accountEmail()
      if (!current) throw new AccountError('unknown')
      await auth.requestEmailChange(result.data.current, result.data.email)
      newAddress = result.data.email
      step.value = 'current'
      emailCode.afterCodeSent(current)
      return true
    } catch (cause) {
      refuse(cause, result.data)
      return false
    } finally {
      isSending.value = false
    }
  }

  async function confirm(): Promise<boolean> {
    if (!(await emailCode.verify())) return false
    if (!accountChanged) {
      step.value = 'new'
      emailCode.afterCodeSent(newAddress)
      return false
    }
    emailCode.close()
    step.value = 'address'
    return true
  }

  function backToAddress(): void {
    emailCode.close()
    step.value = 'address'
    values.value = { current: '', email: newAddress }
    refusal.value = null
    failureKey.value = null
    reset()
  }

  return {
    emailCode,
    step,
    values,
    fieldError,
    failureKey,
    isSending,
    sendCode,
    confirm,
    backToAddress,
  }
}
