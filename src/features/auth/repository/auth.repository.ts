import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js'

import type { AppLocale } from '@/core/i18n'
import { loadSupabaseClient } from '@/core/supabase/load-client'

import { AccountError } from '../logic/account-error'
import { accountErrorFrom } from '../logic/account-error-from'
import { accountIdentityOf, type AccountIdentity } from '../logic/account-identity-of'
import { createSessionRevocation } from './session-revocation.repository'

export type AuthSession = { userId: string }

export type SignUpOutcome =
  { kind: 'signed-in'; session: AuthSession } | { kind: 'confirmation-pending' }

export type SessionCheck =
  { kind: 'active'; session: AuthSession } | { kind: 'needs-refresh' } | { kind: 'needs-sign-in' }

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
  /** Vise le compte de la session de l'appareil. `currentPassword` : joint au corps seulement s'il est fourni. */
  updatePassword(password: string, currentPassword?: string): Promise<AuthSession>
  /** Envoie un code à l'adresse actuelle et un à la nouvelle (double confirmation de Supabase). */
  requestEmailChange(email: string): Promise<void>
  /** `null` : l'adresse est confirmée mais le compte ne change qu'avec le code de l'autre adresse. */
  verifyEmailChangeCode(email: string, code: string): Promise<AuthSession | null>
  /** Supabase cherche le compte par son adresse actuelle et n'envoie rien pour la nouvelle. */
  resendEmailChangeCode(): Promise<void>
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

function isRetryable(error: AuthError | null): boolean {
  return error?.name === 'AuthRetryableFetchError'
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

function sessionOf(session: Session): AuthSession {
  return { userId: session.user.id }
}

function checkOf(session: Session | null, error: AuthError | null): SessionCheck {
  if (session) return { kind: 'active', session: sessionOf(session) }
  return isRetryable(error) ? { kind: 'needs-refresh' } : { kind: 'needs-sign-in' }
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

  const revocation = createSessionRevocation(client)

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

    updatePassword: (password, currentPassword) =>
      withClient(async (supabase) => {
        const { error } = await supabase.auth.updateUser(
          currentPassword === undefined
            ? { password }
            : { password, current_password: currentPassword },
        )
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
        return data.session ? sessionOf(data.session) : null
      }),

    resendEmailChangeCode: () =>
      withClient(async (supabase) => {
        const { data: current } = await supabase.auth.getSession()
        const email = current.session?.user.email
        if (!email) throw new AccountError('unknown')
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

    signOut: revocation.signOut,

    discardSession: revocation.discardSession,

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
