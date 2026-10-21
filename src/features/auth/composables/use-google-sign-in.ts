import { signInErrorKey } from '../logic/account-error-message'
import { useAuthStore } from '../store/auth.store'

export type GoogleSignInResult =
  { kind: 'signed-in' } | { kind: 'cancelled' } | { kind: 'failed'; messageKey: string }

export function useGoogleSignIn(): { continueWithGoogle(): Promise<GoogleSignInResult> } {
  const auth = useAuthStore()

  return {
    async continueWithGoogle() {
      try {
        return { kind: await auth.signInWithGoogle() }
      } catch (cause) {
        return { kind: 'failed', messageKey: signInErrorKey(cause) }
      }
    },
  }
}
