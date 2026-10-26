import { useI18n } from 'vue-i18n'

import { showToast } from '@/shared/utils/toast'

import { signInErrorKey } from '../logic/account-error-message'
import { useAuthStore } from '../store/auth.store'

export type GoogleSignInResult =
  { kind: 'signed-in' } | { kind: 'cancelled' } | { kind: 'failed'; messageKey: string }

export function useGoogleSignIn(): {
  continueWithGoogle(): Promise<GoogleSignInResult>
  announce(result: GoogleSignInResult): void
} {
  const { t } = useI18n()
  const auth = useAuthStore()

  return {
    async continueWithGoogle() {
      try {
        return { kind: await auth.signInWithGoogle() }
      } catch (cause) {
        return { kind: 'failed', messageKey: signInErrorKey(cause) }
      }
    },
    announce(result) {
      if (result.kind === 'signed-in') showToast(t('auth.google.signedIn'))
      else if (result.kind === 'cancelled') showToast(t('auth.google.cancelled'), { tone: 'info' })
    },
  }
}
