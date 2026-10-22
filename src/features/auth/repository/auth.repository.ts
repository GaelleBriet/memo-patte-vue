import type { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js'

import type { AppLocale } from '@/core/i18n'
import { AUTH_STORAGE_KEY } from '@/core/supabase/auth-storage'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { errorSummary } from '@/shared/utils/error-summary'

import { AccountError, type AccountErrorReason } from '../logic/account-error'

export type AuthSession = { userId: string }

export type SignUpOutcome =
  { kind: 'signed-in'; session: AuthSession } | { kind: 'confirmation-pending' }

export type SessionCheck =
  { kind: 'active'; session: AuthSession } | { kind: 'needs-refresh' } | { kind: 'needs-sign-in' }

/** `password` dès que le compte a un mot de passe, même ouvert avec Google ce jour-là. */
export type AccountIdentity =
  { kind: 'password'; email: string } | { kind: 'google'; email: string; subject: string }

export type AuthRepository = {
  /** `locale` choisit la langue de l'e-mail qui porte le code. */
  signUp(email: string, password: string, locale: AppLocale): Promise<SignUpOutcome>
  /** Un code faux et un code expiré lèvent la même raison : Supabase ne les distingue pas. */
  verifySignUpCode(email: string, code: string): Promise<AuthSession>
  resendSignUpCode(email: string): Promise<void>
  /** Supabase répond pareil qu'un compte existe ou non, et n'envoie rien sans compte. */
  sendPasswordResetCode(email: string): Promise<void>
  /** Ouvre une session dans Supabase : `updatePassword` termine le parcours, `discardSession` l'abandonne. */
  verifyPasswordResetCode(email: string, code: string): Promise<AuthSession>
  /** Vise le compte de la session de l'appareil. */
  updatePassword(password: string): Promise<AuthSession>
  /** Envoie un code à la nouvelle adresse seulement (double confirmation désactivée dans Supabase). */
  requestEmailChange(email: string): Promise<void>
  verifyEmailChangeCode(email: string, code: string): Promise<AuthSession>
  resendEmailChangeCode(email: string): Promise<void>
  /** Reconnecte le compte de la session : la connexion récente que Supabase exige pour changer de mot de passe. */
  reauthenticate(password: string): Promise<AuthSession>
  signIn(email: string, password: string): Promise<AuthSession>
  /** `nonce` en clair : Google a reçu son empreinte SHA-256. */
  signInWithGoogleIdToken(idToken: string, nonce: string): Promise<AuthSession>
  /** Ne lève pas : la session quitte toujours l'appareil, même sans réseau. */
  signOut(): Promise<void>
  /** Comme `signOut`, sans fermer les autres appareils du compte. Ne lève pas. */
  discardSession(): Promise<void>
  restoreSession(): Promise<SessionCheck>
  refreshSession(): Promise<SessionCheck>
  /** Lit la session de l'appareil ; `null` sans session. */
  accountIdentity(): Promise<AccountIdentity | null>
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
  same_password: 'same-password',
  email_not_confirmed: 'email-not-confirmed',
  otp_expired: 'invalid-code',
  over_email_send_rate_limit: 'email-rate-limited',
}

function isRetryable(error: AuthError | null): boolean {
  return error?.name === 'AuthRetryableFetchError'
}

export function accountErrorFrom(cause: unknown): AccountError {
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

export function accountIdentityOf(user: User): AccountIdentity {
  const providers = user.app_metadata.providers ?? [user.app_metadata.provider]
  const google = user.identities?.find((identity) => identity.provider === 'google')
  if (providers.includes('email') || !google) return { kind: 'password', email: user.email ?? '' }
  const data = google.identity_data ?? {}
  return {
    kind: 'google',
    email: typeof data.email === 'string' ? data.email : (user.email ?? ''),
    subject: typeof data.sub === 'string' ? data.sub : google.id,
  }
}

/** Lève `AccountError`, `invalid-credentials` pour un mot de passe faux, sans rien envoyer sans session. */
export async function signInAgainWithPassword(
  supabase: SupabaseClient,
  password: string,
): Promise<Session> {
  const { data: current } = await supabase.auth.getSession()
  const email = current.session?.user.email
  if (!email) throw new AccountError('unknown')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

/** Un seul délai pour les deux tentatives de `signOut` : la seconde n'ajoute jamais d'attente. */
function revocationTimeout(): { reached: Promise<Revocation>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const reached = new Promise<Revocation>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, trace: 'délai dépassé' }), SIGN_OUT_TIMEOUT_MS)
  })
  return { reached, clear: () => clearTimeout(timer) }
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

  function revoke(scope: 'global' | 'local'): Promise<Revocation> {
    return client()
      .then((supabase) => supabase.auth.signOut({ scope }))
      .then(
        ({ error }) => (error ? failedRevocation(error) : REVOKED),
        (cause: unknown) => failedRevocation(cause),
      )
  }

  async function withClient<T>(operation: (supabase: SupabaseClient) => Promise<T>): Promise<T> {
    try {
      return await operation(await client())
    } catch (cause) {
      throw accountErrorFrom(cause)
    }
  }

  return {
    signUp: (email, password, locale) =>
      withClient(async (supabase) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { locale } },
        })
        if (error) throw error
        if (data.session) return { kind: 'signed-in', session: sessionOf(data.session) }
        if (data.user?.identities?.length === 0) throw new AccountError('email-taken')
        return { kind: 'confirmation-pending' }
      }),

    verifySignUpCode: (email, code) =>
      withClient(async (supabase) => {
        const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
        if (error) throw error
        if (!data.session) throw new AccountError('unknown')
        return sessionOf(data.session)
      }),

    resendSignUpCode: (email) =>
      withClient(async (supabase) => {
        const { error } = await supabase.auth.resend({ type: 'signup', email })
        if (error) throw error
      }),

    sendPasswordResetCode: (email) =>
      withClient(async (supabase) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) throw error
      }),

    verifyPasswordResetCode: (email, code) =>
      withClient(async (supabase) => {
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token: code,
          type: 'recovery',
        })
        if (error) throw error
        if (!data.session) throw new AccountError('unknown')
        return sessionOf(data.session)
      }),

    updatePassword: (password) =>
      withClient(async (supabase) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        const { data } = await supabase.auth.getSession()
        if (!data.session) throw new AccountError('unknown')
        return sessionOf(data.session)
      }),

    requestEmailChange: (email) =>
      withClient(async (supabase) => {
        const { error } = await supabase.auth.updateUser({ email })
        if (error) throw error
      }),

    verifyEmailChangeCode: (email, code) =>
      withClient(async (supabase) => {
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token: code,
          type: 'email_change',
        })
        if (error) throw error
        const session = data.session ?? (await supabase.auth.getSession()).data.session
        if (!session) throw new AccountError('unknown')
        return sessionOf(session)
      }),

    resendEmailChangeCode: (email) =>
      withClient(async (supabase) => {
        const { error } = await supabase.auth.resend({ type: 'email_change', email })
        if (error) throw error
      }),

    reauthenticate: (password) =>
      withClient(async (supabase) => sessionOf(await signInAgainWithPassword(supabase, password))),

    signIn: (email, password) =>
      withClient(async (supabase) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        return sessionOf(data.session)
      }),

    signInWithGoogleIdToken: (idToken, nonce) =>
      withClient(async (supabase) => {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
          nonce,
        })
        if (error) throw error
        return sessionOf(data.session)
      }),

    async signOut() {
      const timeout = revocationTimeout()
      const outcome = await Promise.race([revoke('global'), timeout.reached])
      if (!outcome.ok) {
        console.warn('Session non invalidée auprès de Supabase :', outcome.trace)
        await Promise.race([revoke('local'), timeout.reached])
        forgetStoredSession()
      }
      timeout.clear()
    },

    async discardSession() {
      const timeout = revocationTimeout()
      const outcome = await Promise.race([revoke('local'), timeout.reached])
      if (!outcome.ok) forgetStoredSession()
      timeout.clear()
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

    accountIdentity: () =>
      withClient(async (supabase) => {
        const { data } = await supabase.auth.getSession()
        return data.session ? accountIdentityOf(data.session.user) : null
      }),

    onSessionChange(listener) {
      listeners.push(listener)
    },
  }
}

export const authRepository = createAuthRepository()
