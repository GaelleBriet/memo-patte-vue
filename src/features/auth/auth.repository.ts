import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js'

import { AUTH_STORAGE_KEY } from '@/core/supabase/auth-storage'
import { errorSummary } from '@/shared/error-summary'

import { AccountError, type AccountErrorReason } from './account-error'

export type AuthSession = { userId: string }

export type SignUpOutcome =
  { kind: 'signed-in'; session: AuthSession } | { kind: 'confirmation-pending' }

export type SessionCheck =
  { kind: 'active'; session: AuthSession } | { kind: 'needs-refresh' } | { kind: 'needs-sign-in' }

export type AuthRepository = {
  signUp(email: string, password: string): Promise<SignUpOutcome>
  signIn(email: string, password: string): Promise<AuthSession>
  /** Ne lève pas : la session quitte toujours l'appareil, même sans réseau. */
  signOut(): Promise<void>
  restoreSession(): Promise<SessionCheck>
  refreshSession(): Promise<SessionCheck>
  /** `null` quand Supabase met fin à la session, par exemple un jeton de rafraîchissement refusé. */
  onSessionChange(listener: (session: AuthSession | null) => void): void
}

export type AuthDependencies = {
  loadClient?: () => Promise<SupabaseClient>
}

/** Hors ligne, Supabase retente le rafraîchissement pendant 30 s avant d'abandonner. */
export const SIGN_OUT_TIMEOUT_MS = 3_000

const REASONS_BY_CODE: Record<string, AccountErrorReason> = {
  email_exists: 'email-taken',
  user_already_exists: 'email-taken',
  invalid_credentials: 'invalid-credentials',
  weak_password: 'weak-password',
  email_not_confirmed: 'email-not-confirmed',
}

async function loadSupabaseClient(): Promise<SupabaseClient> {
  return (await import('@/core/supabase/client')).default
}

function isRetryable(error: AuthError | null): boolean {
  return error?.name === 'AuthRetryableFetchError'
}

function accountErrorFrom(cause: unknown): AccountError {
  if (cause instanceof AccountError) return cause
  const { name, status, code } = (cause ?? {}) as Partial<AuthError>
  if (name === 'AuthRetryableFetchError' && status === 0) {
    return new AccountError('offline', { cause })
  }
  return new AccountError((code && REASONS_BY_CODE[code]) || 'unknown', { cause })
}

type Revocation = { ok: true } | { ok: false; trace: string }

const REVOKED: Revocation = { ok: true }

function failedRevocation(cause: unknown): Revocation {
  return { ok: false, trace: errorSummary(cause) }
}

function sessionOf(session: Session): AuthSession {
  return { userId: session.user.id }
}

function checkOf(session: Session | null, error: AuthError | null): SessionCheck {
  if (session) return { kind: 'active', session: sessionOf(session) }
  return isRetryable(error) ? { kind: 'needs-refresh' } : { kind: 'needs-sign-in' }
}

function pendingPkceFlowIds(): string[] {
  try {
    const index: unknown = JSON.parse(
      localStorage.getItem(`${AUTH_STORAGE_KEY}-flows-code-verifier`) ?? '[]',
    )
    return Array.isArray(index) ? index.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function forgetStoredSession(): void {
  const keys = [
    ...pendingPkceFlowIds().map((id) => `${AUTH_STORAGE_KEY}-flow-${id}-code-verifier`),
    `${AUTH_STORAGE_KEY}-flows-code-verifier`,
    `${AUTH_STORAGE_KEY}-code-verifier`,
    `${AUTH_STORAGE_KEY}-user`,
    AUTH_STORAGE_KEY,
  ]
  for (const key of keys) {
    try {
      localStorage.removeItem(key)
    } catch (cause) {
      console.warn('Session non effacée de l’appareil :', errorSummary(cause))
    }
  }
}

export function createAuthRepository({
  loadClient = loadSupabaseClient,
}: AuthDependencies = {}): AuthRepository {
  const listeners: Array<(session: AuthSession | null) => void> = []
  let loaded: Promise<SupabaseClient> | null = null

  function client(): Promise<SupabaseClient> {
    loaded ??= loadClient()
      .then((supabase) => {
        supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_OUT') listeners.forEach((listener) => listener(null))
          else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
            listeners.forEach((listener) => listener(sessionOf(session)))
          }
        })
        return supabase
      })
      .catch((cause: unknown) => {
        loaded = null
        throw cause
      })
    return loaded
  }

  async function withClient<T>(operation: (supabase: SupabaseClient) => Promise<T>): Promise<T> {
    try {
      return await operation(await client())
    } catch (cause) {
      throw accountErrorFrom(cause)
    }
  }

  return {
    signUp: (email, password) =>
      withClient(async (supabase) => {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) return { kind: 'signed-in', session: sessionOf(data.session) }
        if (data.user?.identities?.length === 0) throw new AccountError('email-taken')
        return { kind: 'confirmation-pending' }
      }),

    signIn: (email, password) =>
      withClient(async (supabase) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        return sessionOf(data.session)
      }),

    async signOut() {
      const revoke = (scope: 'global' | 'local'): Promise<Revocation> =>
        client()
          .then((supabase) => supabase.auth.signOut({ scope }))
          .then(
            ({ error }) => (error ? failedRevocation(error) : REVOKED),
            (cause: unknown) => failedRevocation(cause),
          )
      let timer: ReturnType<typeof setTimeout> | undefined
      // Un seul délai pour les deux tentatives : la seconde n'ajoute jamais d'attente à la première.
      const timeout = new Promise<Revocation>((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, trace: 'délai dépassé' }),
          SIGN_OUT_TIMEOUT_MS,
        )
      })
      const outcome = await Promise.race([revoke('global'), timeout])
      if (!outcome.ok) {
        console.warn('Session non invalidée auprès de Supabase :', outcome.trace)
        await Promise.race([revoke('local'), timeout])
        forgetStoredSession()
      }
      clearTimeout(timer)
    },

    async restoreSession() {
      const { data, error } = await (await client()).auth.getSession()
      return checkOf(data.session, error)
    },

    async refreshSession() {
      const supabase = await client()
      const { data, error } = await supabase.auth.refreshSession()
      if (data.session || isRetryable(error)) return checkOf(data.session, error)
      const current = await supabase.auth.getSession()
      return checkOf(current.data.session, current.error)
    },

    onSessionChange(listener) {
      listeners.push(listener)
    },
  }
}

export const authRepository = createAuthRepository()
