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

/** Le plugin Capacitor est un proxy : le rendre tel quel à une promesse la bloque (`then` y est une méthode native absente). */
type LoadedPlugin = { plugin: GoogleSignInPlugin }

export type GoogleCredentialsDependencies = {
  /** Toujours l'identifiant du client Web, même sur Android. */
  clientId: string | undefined
  isNativePlatform: () => boolean
  loadPlugin?: () => Promise<LoadedPlugin>
  timeoutMs?: number
}

const FAILURES_BY_CODE: Record<string, GoogleCredentialFailure> = {
  NO_CREDENTIAL_AVAILABLE: 'no-google-account',
  PROVIDER_CONFIGURATION_ERROR: 'unavailable',
}

const DEFAULT_TIMEOUT_MS = 20_000

const CANCELLED_CODE = 'SIGN_IN_CANCELED'

async function loadGoogleSignIn(): Promise<LoadedPlugin> {
  return { plugin: (await import('@capawesome/capacitor-google-sign-in')).GoogleSignIn }
}

function codeOf(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined
  const { code } = cause as { code?: unknown }
  return typeof code === 'string' ? code : undefined
}

function withTimeout<T>(pending: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new GoogleCredentialError('unavailable', { cause: new Error('délai dépassé') })),
      timeoutMs,
    )
    pending.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (cause: unknown) => {
        clearTimeout(timer)
        reject(cause)
      },
    )
  })
}

export function createGoogleCredentials({
  clientId,
  isNativePlatform,
  loadPlugin = loadGoogleSignIn,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: GoogleCredentialsDependencies): GoogleCredentials {
  let initialized: Promise<LoadedPlugin> | null = null

  function ready(webClientId: string): Promise<LoadedPlugin> {
    initialized ??= loadPlugin()
      .then(async (loaded) => {
        await withTimeout(loaded.plugin.initialize({ clientId: webClientId }), timeoutMs)
        return loaded
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
        const { plugin } = await ready(clientId)
        const { idToken } = await withTimeout(plugin.signIn({ nonce: hashedNonce }), timeoutMs)
        return { kind: 'granted', idToken }
      } catch (cause) {
        if (import.meta.env.DEV) console.warn('[google-sign-in]', codeOf(cause), cause)
        if (cause instanceof GoogleCredentialError) throw cause
        const code = codeOf(cause)
        if (code === CANCELLED_CODE) return { kind: 'cancelled' }
        throw new GoogleCredentialError((code && FAILURES_BY_CODE[code]) || 'failed', { cause })
      }
    },

    async signOut() {
      if (!clientId || !isNativePlatform()) return
      try {
        await (await ready(clientId)).plugin.signOut()
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
