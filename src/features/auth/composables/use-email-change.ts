import { ref } from 'vue'

import { AccountError } from '../logic/account-error'
import { accountErrorKey, signInErrorKey } from '../logic/account-error-message'
import { validateEmailChange, type EmailChangeValues } from '../logic/email-change-form'
import { useAuthStore } from '../store/auth.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

import { useFieldRefusal } from './use-field-refusal'
import { useEmailCode, type ResendResult } from './use-email-code'

export type EmailChangeStep = 'address' | 'current' | 'new'

/** « Changer mon adresse e-mail » (PL-10, V24 quater à sexies) : le mot de passe, la nouvelle adresse, puis le code de chaque adresse. */
export function useEmailChange({
  now = Date.now,
  accountEmail = () => null,
}: { now?: () => number; accountEmail?: () => string | null } = {}) {
  const auth = useAuthStore()
  let accountChanged = false
  let newAddress = ''
  let currentAddress = ''
  let sentAt = 0
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
  const failureKey = ref<string | null>(null)
  const isSending = ref(false)

  const { errors, validate, reset } = useFormValidation(values, (current) =>
    validateEmailChange(current, accountEmail()),
  )

  const refusal = useFieldRefusal(values, errors)

  function refuse(cause: unknown, data: EmailChangeValues): void {
    const reason = cause instanceof AccountError ? cause.reason : 'unknown'
    if (refusal.refuseWrongPassword(cause, data.current)) return
    if (reason === 'email-taken' || reason === 'email-rate-limited') {
      refusal.refuse('email', values.value.email, accountErrorKey(reason))
    } else {
      failureKey.value = signInErrorKey(cause)
    }
  }

  async function sendCode(): Promise<boolean> {
    if (isSending.value) return false
    failureKey.value = null
    refusal.clear()
    const result = validate()
    if (!result.success) return false
    isSending.value = true
    try {
      const current = accountEmail()
      if (!current) throw new AccountError('unknown')
      await auth.requestEmailChange(result.data.current, result.data.email)
      newAddress = result.data.email
      currentAddress = current
      sentAt = now()
      step.value = 'current'
      emailCode.afterCodeSent(current, sentAt)
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
      emailCode.afterCodeSent(newAddress, sentAt)
      return false
    }
    emailCode.close()
    step.value = 'address'
    return true
  }

  async function resend(): Promise<ResendResult> {
    const result = await emailCode.resend()
    if (result !== 'sent') return result
    sentAt = now()
    step.value = 'current'
    emailCode.afterCodeSent(currentAddress, sentAt)
    return result
  }

  function backToAddress(): void {
    emailCode.close()
    step.value = 'address'
    values.value = { current: '', email: newAddress }
    refusal.clear()
    failureKey.value = null
    reset()
  }

  return {
    emailCode,
    step,
    values,
    fieldError: refusal.fieldError,
    failureKey,
    isSending,
    sendCode,
    confirm,
    resend,
    backToAddress,
  }
}
