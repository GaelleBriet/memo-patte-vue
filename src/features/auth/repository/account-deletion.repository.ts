import { FunctionsHttpError, type SupabaseClient, type User } from '@supabase/supabase-js'

import { loadSupabaseClient } from '@/core/supabase/load-client'
import { errorSummary } from '@/shared/utils/error-summary'

import { AccountDeletionError } from '../logic/account-deletion-error'
import { AccountError } from '../logic/account-error'
import { accountErrorFrom } from '../logic/account-error-from'
import { accountIdentityOf, signInAgainWithPassword } from './auth.repository'

export type IdentityConfirmationMethod =
  { kind: 'password' } | { kind: 'google'; email: string; subject: string }

export type AccountDeletionRepository = {
  /** Lit la session de l'appareil. Lève `AccountError`. */
  confirmationMethod(): Promise<IdentityConfirmationMethod>
  /** Lève `AccountError`, `invalid-credentials` pour un mot de passe faux. */
  confirmPassword(password: string): Promise<void>
  /** Lève `AccountError`. */
  confirmWithGoogleIdToken(idToken: string, nonce: string): Promise<void>
  /** Vise le compte de la session. Lève `AccountDeletionError`. */
  deleteAccount(): Promise<void>
}

export type AccountDeletionDependencies = {
  loadClient?: () => Promise<SupabaseClient>
}

const DELETE_ACCOUNT_FUNCTION = 'delete-account'
const IDENTITY_TOO_OLD_STATUS = 401

function methodOf(user: User): IdentityConfirmationMethod {
  const identity = accountIdentityOf(user)
  return identity.kind === 'password' ? { kind: 'password' } : identity
}

function deletionErrorFrom(cause: unknown): AccountDeletionError {
  const tooOld =
    cause instanceof FunctionsHttpError &&
    (cause.context as Response).status === IDENTITY_TOO_OLD_STATUS
  return new AccountDeletionError(tooOld ? 'identity-expired' : 'failed', { cause })
}

export function createAccountDeletionRepository({
  loadClient = loadSupabaseClient,
}: AccountDeletionDependencies = {}): AccountDeletionRepository {
  async function withClient<T>(operation: (supabase: SupabaseClient) => Promise<T>): Promise<T> {
    try {
      return await operation(await loadClient())
    } catch (cause) {
      throw accountErrorFrom(cause)
    }
  }

  async function sessionUser(supabase: SupabaseClient): Promise<User> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw new AccountError('unknown')
    return data.session.user
  }

  return {
    confirmationMethod: () => withClient(async (supabase) => methodOf(await sessionUser(supabase))),

    confirmPassword: (password) =>
      withClient(async (supabase) => {
        await signInAgainWithPassword(supabase, password)
      }),

    confirmWithGoogleIdToken: (idToken, nonce) =>
      withClient(async (supabase) => {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
          nonce,
        })
        if (error) throw error
      }),

    async deleteAccount() {
      try {
        const supabase = await loadClient()
        const { error } = await supabase.functions.invoke(DELETE_ACCOUNT_FUNCTION, {
          method: 'POST',
        })
        if (error) throw error
      } catch (cause) {
        console.warn('Compte non supprimé :', errorSummary(cause))
        throw deletionErrorFrom(cause)
      }
    },
  }
}

export const accountDeletionRepository = createAccountDeletionRepository()
