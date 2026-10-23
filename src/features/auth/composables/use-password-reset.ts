import { computed, onScopeDispose, ref } from 'vue'

import { AccountError } from '../logic/account-error'
import { accountErrorKey, signInErrorKey } from '../logic/account-error-message'
import { mustWaitBeforeResend } from '../logic/email-code'
import { validateNewPassword, validateResetEmail } from '../logic/password-reset-form'
import { useAuthStore } from '../store/auth.store'
import { useFormValidation } from '@/shared/form/use-form-validation'

import { useEmailCode } from './use-email-code'
import { usePasswordConfirmation } from './use-password-confirmation'

const WAIT_KEY = 'auth.code.wait'

type RefusedPassword = { password: string; key: string }

/** Mot de passe oublié (PL-9) : l'adresse, puis le code et le nouveau mot de passe. */
export function usePasswordReset({
  email = '',
  isEmailLocked = false,
  now = Date.now,
}: { email?: string; isEmailLocked?: boolean; now?: () => number } = {}) {
  const auth = useAuthStore()
  const emailCode = useEmailCode({
    now,
    lateSuccess: 'abandon',
    onAbandoned: () => void auth.abandonPasswordReset(),
    operations: {
      resend: (address) => auth.sendPasswordResetCode(address),
      verify: (address, code) => auth.verifyPasswordResetCode(address, code),
    },
  })

  const address = ref({ email })
  const newPassword = ref({ password: '', confirmation: '' })
  const addressFailureKey = ref<string | null>(null)
  const refusedPassword = ref<RefusedPassword | null>(null)
  const isSending = ref(false)
  const isResetting = ref(false)
  let lastSent: { email: string; at: number } | null = null
  let isCodeAccepted = false
  let isDone = false

  const addressValidation = useFormValidation(address, validateResetEmail)
  const passwordValidation = useFormValidation(newPassword, validateNewPassword)
  const confirmation = usePasswordConfirmation(
    () => newPassword.value.password,
    () => newPassword.value.confirmation,
    () => passwordValidation.errors.value.confirmation,
  )

  const step = computed(() => (emailCode.email.value === null ? 'address' : 'code'))
  const passwordError = computed(() => {
    const refused = refusedPassword.value
    if (refused && refused.password === newPassword.value.password) return refused.key
    return passwordValidation.errors.value.password ?? null
  })

  function abandonAcceptedCode(): void {
    if (!isCodeAccepted || isDone) return
    isCodeAccepted = false
    void auth.abandonPasswordReset()
  }

  async function sendCode(): Promise<boolean> {
    if (isSending.value) return false
    addressFailureKey.value = null
    if (isEmailLocked) address.value = { email }
    const result = addressValidation.validate()
    if (!result.success) return false
    const target = result.data.email
    if (lastSent?.email === target && mustWaitBeforeResend(lastSent.at, now())) {
      addressFailureKey.value = WAIT_KEY
      return false
    }
    isSending.value = true
    try {
      await auth.sendPasswordResetCode(target)
      lastSent = { email: target, at: now() }
      abandonAcceptedCode()
      emailCode.afterCodeSent(target)
      return true
    } catch (cause) {
      addressFailureKey.value = signInErrorKey(cause)
      return false
    } finally {
      isSending.value = false
    }
  }

  async function reset(): Promise<boolean> {
    if (isResetting.value) return false
    const result = passwordValidation.validate()
    if (!result.success) return false
    isResetting.value = true
    try {
      if (!isCodeAccepted) {
        if (!(await emailCode.verify())) return false
        isCodeAccepted = true
      }
      await auth.changePassword(result.data.password)
      isDone = true
      emailCode.close()
      return true
    } catch (cause) {
      const reason = cause instanceof AccountError ? cause.reason : 'unknown'
      if (reason === 'same-password' || reason === 'weak-password') {
        refusedPassword.value = { password: result.data.password, key: accountErrorKey(reason) }
      } else {
        emailCode.errorKey.value = signInErrorKey(cause)
      }
      return false
    } finally {
      isResetting.value = false
    }
  }

  async function resend(): ReturnType<typeof emailCode.resend> {
    const outcome = await emailCode.resend()
    if (outcome === 'sent') {
      abandonAcceptedCode()
      if (emailCode.email.value) lastSent = { email: emailCode.email.value, at: now() }
    }
    return outcome
  }

  function backToAddress(): void {
    abandonAcceptedCode()
    address.value = { email: emailCode.close().email }
    newPassword.value = { password: '', confirmation: '' }
    refusedPassword.value = null
    addressFailureKey.value = null
    passwordValidation.reset()
    confirmation.reset()
  }

  onScopeDispose(abandonAcceptedCode)

  return {
    emailCode: { ...emailCode, resend },
    isEmailLocked,
    step,
    address,
    addressErrors: addressValidation.errors,
    addressFailureKey,
    newPassword,
    passwordError,
    isPasswordConfirmed: confirmation.isConfirmed,
    confirmationError: confirmation.error,
    leaveConfirmation: confirmation.leave,
    isSending,
    isResetting,
    sendCode,
    reset,
    backToAddress,
  }
}
