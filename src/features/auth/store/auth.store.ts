import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { googleCredentials } from '@/core/google-sign-in/google-credentials'
import { currentLocale } from '@/core/i18n'
import { identify, reset as resetAnalytics } from '@/core/analytics'
import { errorSummary } from '@/shared/utils/error-summary'

import {
  type AccountIdentity,
  type AuthRepository,
  type AuthSession,
  type SessionCheck,
  type SignUpOutcome,
} from '../repository/auth.repository'
import {
  clearDeletedAccountState,
  clearDeviceAccountState,
  clearSignedOutAccountState,
} from '../service/device-account-state.service'
import { signInWithGoogle, type GoogleSignInOutcome } from '../service/google-sign-in.service'
import {
  clearPlusAccount,
  readPlusAccount,
  writePlusAccount,
  type PlusAccount,
} from '../logic/plus-account-storage'

export type SessionState = 'none' | 'restoring' | 'active' | 'needs-refresh' | 'needs-sign-in'

export type AuthRepositoryProvider = () => AuthRepository

let provider: AuthRepositoryProvider | null = null

export function provideAuthRepository(next: AuthRepositoryProvider | null): void {
  provider = next
}

export const useAuthStore = defineStore('auth', () => {
  if (!provider) {
    throw new Error('Repository du compte absent : appelle provideAuthRepository().')
  }
  const repository = provider()

  const account = ref<PlusAccount | null>(readPlusAccount())
  const sessionState = ref<SessionState>(account.value ? 'restoring' : 'none')
  const hasPlusAccount = computed(() => account.value !== null)
  const userId = computed(() => account.value?.userId ?? null)

  let generation = 0
  let recovered: AuthSession | null = null

  function isOtherAccount(session: AuthSession): boolean {
    return account.value !== null && account.value.userId !== session.userId
  }

  function record(session: AuthSession): void {
    generation += 1
    if (account.value?.userId !== session.userId) {
      if (account.value) clearDeviceAccountState()
      account.value = { userId: session.userId }
      writePlusAccount(account.value)
      identify(session.userId)
    }
    sessionState.value = 'active'
  }

  async function check(request: () => Promise<SessionCheck>): Promise<boolean> {
    if (!account.value) return false
    const startedAt = generation
    let result: SessionCheck
    try {
      result = await request()
    } catch (cause) {
      console.warn('Session Plus non vérifiée :', errorSummary(cause))
      result = { kind: 'needs-refresh' }
    }
    if (generation !== startedAt || !account.value) return false
    if (result.kind === 'active' && isOtherAccount(result.session)) {
      await repository.discardSession()
      sessionState.value = 'needs-sign-in'
      return false
    }
    if (result.kind === 'active') {
      record(result.session)
      return true
    }
    sessionState.value = result.kind
    return false
  }

  async function leaveAccount(clearAccountState: () => void): Promise<void> {
    await repository.signOut()
    generation += 1
    account.value = null
    clearPlusAccount()
    clearAccountState()
    sessionState.value = 'none'
    resetAnalytics()
    await googleCredentials.signOut()
  }

  repository.onSessionChange((session) => {
    if (!account.value) return
    if (session && isOtherAccount(session)) return
    if (session) record(session)
    else sessionState.value = 'needs-sign-in'
  })

  return {
    hasPlusAccount,
    userId,
    sessionState,

    /** Sans compte Plus sur l'appareil, ne contacte pas Supabase. Ne lève pas. */
    async restore(): Promise<void> {
      await check(() => repository.restoreSession())
    },

    /** Ne lève pas : renvoie `true` quand la session est de nouveau active. */
    refresh(): Promise<boolean> {
      return check(() => repository.refreshSession())
    },

    /** Ne lève pas : `null` quand l'adresse du compte n'est pas lisible sur l'appareil. */
    async accountIdentity(): Promise<AccountIdentity | null> {
      try {
        return await repository.accountIdentity()
      } catch (cause) {
        console.warn('Adresse du compte illisible :', errorSummary(cause))
        return null
      }
    },

    async signUp(email: string, password: string): Promise<SignUpOutcome['kind']> {
      const outcome = await repository.signUp(email, password, currentLocale())
      if (outcome.kind === 'signed-in') record(outcome.session)
      return outcome.kind
    },

    async verifySignUpCode(email: string, code: string): Promise<void> {
      record(await repository.verifySignUpCode(email, code))
    },

    resendSignUpCode: (email: string): Promise<void> => repository.resendSignUpCode(email),

    sendPasswordResetCode: (email: string): Promise<void> =>
      repository.sendPasswordResetCode(email),

    /** N'ouvre pas le compte sur l'appareil : `changePassword` le fait une fois le mot de passe changé. */
    async verifyPasswordResetCode(email: string, code: string): Promise<void> {
      recovered = await repository.verifyPasswordResetCode(email, code)
    },

    async changePassword(password: string): Promise<void> {
      record(await repository.updatePassword(password))
      recovered = null
    },

    /** Ferme la session d'un code accepté sans mot de passe changé, sauf si c'est le compte de l'appareil. */
    async abandonPasswordReset(): Promise<void> {
      const session = recovered
      recovered = null
      if (session && account.value?.userId !== session.userId) await repository.discardSession()
    },

    async signIn(email: string, password: string): Promise<void> {
      record(await repository.signIn(email, password))
    },

    async signInWithGoogle(): Promise<GoogleSignInOutcome['kind']> {
      const outcome = await signInWithGoogle(repository)
      if (outcome.kind === 'signed-in') record(outcome.session)
      return outcome.kind
    },

    /** Efface la session et les compteurs du compte ; le carnet local et l'achat restent. */
    signOut: (): Promise<void> => leaveAccount(clearSignedOutAccountState),

    /** Après la suppression du compte : comme la déconnexion, et l'app redevient gratuite. */
    forgetDeletedAccount: (): Promise<void> => leaveAccount(clearDeletedAccountState),
  }
})
