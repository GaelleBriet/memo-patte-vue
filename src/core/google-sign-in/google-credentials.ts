import { Capacitor } from '@capacitor/core'
import type { GoogleSignInPlugin } from '@capawesome/capacitor-google-sign-in'

export type GoogleCredential = { kind: 'granted'; idToken: string } | { kind: 'cancelled' }

export type GoogleCredentialFailure = 'no-google-account' | 'unavailable' | 'failed'

export class GoogleCredentialError extends Error {
  override readonly name = 'GoogleCredentialError'

  constructor(
    readonly reason: GoogleCredentialFailure,
    options?: { cause?: unknown },
  ) {
    super(`Connexion Google impossible : ${reason}`, options)
  }
}

export type GoogleCredentials = {
  /** `hashedNonce` : l'empreinte SHA-256 du nonce que Supabase recevra en clair. */
  request(hashedNonce: string): Promise<GoogleCredential>
  /** Ne lève jamais : un échec ne doit pas retenir la déconnexion de MémoPatte. */
  signOut(): Promise<void>
}

export type GoogleCredentialsDependencies = {
  /** Toujours l'identifiant du client Web, même sur Android. */
  clientId: string | undefined
  isNativePlatform: () => boolean
  loadPlugin?: () => Promise<GoogleSignInPlugin>
}

const FAILURES_BY_CODE: Record<string, GoogleCredentialFailure> = {
  NO_CREDENTIAL_AVAILABLE: 'no-google-account',
  PROVIDER_CONFIGURATION_ERROR: 'unavailable',
}

const CANCELLED_CODE = 'SIGN_IN_CANCELED'

async function loadGoogleSignIn(): Promise<GoogleSignInPlugin> {
  return (await import('@capawesome/capacitor-google-sign-in')).GoogleSignIn
}

function codeOf(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined
  const { code } = cause as { code?: unknown }
  return typeof code === 'string' ? code : undefined
}

export function createGoogleCredentials({
  clientId,
  isNativePlatform,
  loadPlugin = loadGoogleSignIn,
}: GoogleCredentialsDependencies): GoogleCredentials {
  let initialized: Promise<GoogleSignInPlugin> | null = null

  function ready(webClientId: string): Promise<GoogleSignInPlugin> {
    initialized ??= loadPlugin()
      .then(async (plugin) => {
        await plugin.initialize({ clientId: webClientId })
        return plugin
      })
      .catch((cause: unknown) => {
        initialized = null
        throw cause
      })
    return initialized
  }

  return {
    async request(hashedNonce) {
      if (!clientId || !isNativePlatform()) throw new GoogleCredentialError('unavailable')
      try {
        const plugin = await ready(clientId)
        const { idToken } = await plugin.signIn({ nonce: hashedNonce })
        return { kind: 'granted', idToken }
      } catch (cause) {
        const code = codeOf(cause)
        if (code === CANCELLED_CODE) return { kind: 'cancelled' }
        throw new GoogleCredentialError((code && FAILURES_BY_CODE[code]) || 'failed', { cause })
      }
    },

    async signOut() {
      if (!clientId || !isNativePlatform()) return
      try {
        await (await ready(clientId)).signOut()
      } catch {
        return
      }
    },
  }
}

export const googleCredentials = createGoogleCredentials({
  clientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
  isNativePlatform: () => Capacitor.isNativePlatform(),
})
