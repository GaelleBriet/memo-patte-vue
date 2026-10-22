import { computed, ref } from 'vue'

import { AccountError } from '../logic/account-error'
import { signInErrorKey } from '../logic/account-error-message'
import {
  codeDigits,
  isCompleteCode,
  mustWaitBeforeResend,
  refusedCodeKey,
} from '../logic/email-code'
import type { SignInMode } from '../logic/sign-in-form'
import { useAuthStore } from '../store/auth.store'

const EXPIRED_KEY = 'auth.code.errors.expired'

export type UnconfirmedSignInResult = { kind: 'opened' } | { kind: 'failed'; messageKey: string }

export type ResendResult = 'sent' | 'wait' | 'failed'

/** Ce que l'étape du code demande au serveur ; par défaut, le code de l'inscription. */
export type EmailCodeOperations = {
  resend(email: string): Promise<void>
  verify(email: string, code: string): Promise<void>
}

export function useEmailCode({
  now = Date.now,
  operations,
}: { now?: () => number; operations?: EmailCodeOperations } = {}) {
  const auth = useAuthStore()
  const { resend: resendCode, verify: verifyCode } = operations ?? {
    resend: (email: string) => auth.resendSignUpCode(email),
    verify: (email: string, code: string) => auth.verifySignUpCode(email, code),
  }

  const email = ref<string | null>(null)
  const origin = ref<SignInMode>('sign-up')
  const code = ref('')
  const errorKey = ref<string | null>(null)
  const noticeKey = ref<string | null>(null)
  const isConfirming = ref(false)
  const isResending = ref(false)
  let sentAt: number | null = null

  const isComplete = computed(() => isCompleteCode(code.value))
  const isExpired = computed(() => errorKey.value === EXPIRED_KEY)

  function forget(): void {
    email.value = null
    code.value = ''
    errorKey.value = null
    noticeKey.value = null
    sentAt = null
  }

  function open(address: string, from: SignInMode, sent: number | null): void {
    email.value = address
    origin.value = from
    code.value = ''
    errorKey.value = null
    noticeKey.value = null
    sentAt = sent
  }

  async function verify(): Promise<boolean> {
    if (!email.value || !isComplete.value || isConfirming.value) return false
    isConfirming.value = true
    errorKey.value = null
    noticeKey.value = null
    try {
      await verifyCode(email.value, code.value)
      return true
    } catch (cause) {
      errorKey.value =
        cause instanceof AccountError && cause.reason === 'invalid-code'
          ? refusedCodeKey(sentAt, now())
          : signInErrorKey(cause)
      return false
    } finally {
      isConfirming.value = false
    }
  }

  return {
    email,
    origin,
    code,
    errorKey,
    noticeKey,
    isConfirming,
    isResending,
    isComplete,
    isExpired,

    afterSignUp(address: string): void {
      open(address, 'sign-up', now())
    },

    afterCodeSent(address: string): void {
      open(address, 'sign-in', now())
    },

    async afterUnconfirmedSignIn(address: string): Promise<UnconfirmedSignInResult> {
      try {
        await resendCode(address)
        open(address, 'sign-in', now())
      } catch (cause) {
        if (cause instanceof AccountError && cause.reason === 'offline') {
          return { kind: 'failed', messageKey: signInErrorKey(cause) }
        }
        open(address, 'sign-in', null)
      }
      return { kind: 'opened' }
    },

    setCode(input: string): void {
      code.value = codeDigits(input)
      errorKey.value = null
    },

    /** Vérifie le code sans fermer l'étape. */
    verify,

    /** Vérifie le code puis ferme l'étape. */
    async confirm(): Promise<boolean> {
      if (!(await verify())) return false
      forget()
      return true
    },

    async resend(): Promise<ResendResult> {
      if (!email.value || isResending.value) return 'failed'
      if (mustWaitBeforeResend(sentAt, now())) {
        noticeKey.value = 'auth.code.wait'
        return 'wait'
      }
      isResending.value = true
      noticeKey.value = null
      try {
        await resendCode(email.value)
        sentAt = now()
        code.value = ''
        errorKey.value = null
        return 'sent'
      } catch (cause) {
        if (cause instanceof AccountError && cause.reason === 'email-rate-limited') {
          noticeKey.value = 'auth.code.wait'
          return 'wait'
        }
        errorKey.value = signInErrorKey(cause)
        return 'failed'
      } finally {
        isResending.value = false
      }
    },

    close(): { email: string; origin: SignInMode } {
      const closed = { email: email.value ?? '', origin: origin.value }
      forget()
      return closed
    },
  }
}
