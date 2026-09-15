import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  authRepository,
  type AuthSession,
  type SessionCheck,
  type SignUpOutcome,
} from './auth.repository'
import {
  clearPlusAccount,
  readPlusAccount,
  writePlusAccount,
  type PlusAccount,
} from './plus-account-storage'

export type SessionState = 'none' | 'restoring' | 'active' | 'needs-refresh' | 'needs-sign-in'

export const useAuthStore = defineStore('auth', () => {
  const account = ref<PlusAccount | null>(readPlusAccount())
  const sessionState = ref<SessionState>(account.value ? 'restoring' : 'none')
  const hasPlusAccount = computed(() => account.value !== null)
  const userId = computed(() => account.value?.userId ?? null)

  let generation = 0

  function record(session: AuthSession): void {
    generation += 1
    if (account.value?.userId !== session.userId) {
      account.value = { userId: session.userId }
      writePlusAccount(account.value)
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
      console.warn('Session Plus non vérifiée :', cause)
      result = { kind: 'needs-refresh' }
    }
    if (generation !== startedAt || !account.value) return false
    if (result.kind === 'active') {
      record(result.session)
      return true
    }
    sessionState.value = result.kind
    return false
  }

  authRepository.onSessionChange((session) => {
    if (!account.value) return
    if (session) record(session)
    else sessionState.value = 'needs-sign-in'
  })

  return {
    hasPlusAccount,
    userId,
    sessionState,

    /** Sans compte Plus sur l'appareil, ne contacte pas Supabase. Ne lève pas. */
    async restore(): Promise<void> {
      await check(() => authRepository.restoreSession())
    },

    /** Ne lève pas : renvoie `true` quand la session est de nouveau active. */
    refresh(): Promise<boolean> {
      return check(() => authRepository.refreshSession())
    },

    async signUp(email: string, password: string): Promise<SignUpOutcome['kind']> {
      const outcome = await authRepository.signUp(email, password)
      if (outcome.kind === 'signed-in') record(outcome.session)
      return outcome.kind
    },

    async signIn(email: string, password: string): Promise<void> {
      record(await authRepository.signIn(email, password))
    },

    /** Efface la session et le drapeau ; les données locales restent. */
    async signOut(): Promise<void> {
      await authRepository.signOut()
      generation += 1
      account.value = null
      clearPlusAccount()
      sessionState.value = 'none'
    },
  }
})
