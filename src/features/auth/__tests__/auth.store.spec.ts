// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ANALYTICS_CONSENT_KEY } from '@/core/analytics/analytics'
import { PLUS_NUDGE_STORAGE_KEY } from '@/features/purchase/plus-nudge'
import {
  PLUS_STATUS_STORAGE_KEY,
  readStoredPlusStatus,
  writeStoredPlusStatus,
} from '@/features/purchase/plus-status-storage'
import { usePurchaseStore } from '@/features/purchase/purchase.store'
import { USAGE_SIGNALS_STORAGE_KEY } from '@/shared/usage-signals'

import { AccountError } from '../account-error'
import { authRepository, type AuthRepository, type AuthSession } from '../auth.repository'
import { useAuthStore } from '../auth.store'
import { readPlusAccount, writePlusAccount } from '../plus-account-storage'
import { memoryStorage, OTHER_USER_ID, USER_ID } from './auth-fixture'

const ACCOUNT_KEYS = [PLUS_STATUS_STORAGE_KEY, PLUS_NUDGE_STORAGE_KEY, USAGE_SIGNALS_STORAGE_KEY]
const UNRELATED_KEYS = [ANALYTICS_CONSENT_KEY, 'memopatte.notifications.primingAnswered']

function writeDeviceState(): void {
  for (const key of [...ACCOUNT_KEYS, ...UNRELATED_KEYS]) localStorage.setItem(key, '{}')
}

function remainingDeviceState(): string[] {
  return [...ACCOUNT_KEYS, ...UNRELATED_KEYS].filter((key) => localStorage.getItem(key) !== null)
}

vi.mock('../auth.repository', () => ({
  authRepository: {
    signUp: vi.fn<AuthRepository['signUp']>(),
    signIn: vi.fn<AuthRepository['signIn']>(),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
    restoreSession: vi.fn<AuthRepository['restoreSession']>(),
    refreshSession: vi.fn<AuthRepository['refreshSession']>(),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
  },
}))

const repository = vi.mocked(authRepository)

function supabaseEndsOrRefreshesSession(session: AuthSession | null): void {
  const listener = repository.onSessionChange.mock.lastCall?.[0]
  if (!listener) throw new Error('le store n’écoute pas la session')
  listener(session)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useAuthStore', () => {
  describe('appareil sans compte Plus', () => {
    it('n’a ni compte ni session', () => {
      const store = useAuthStore()

      expect(store.hasPlusAccount).toBe(false)
      expect(store.userId).toBeNull()
      expect(store.sessionState).toBe('none')
    })

    it('ne contacte pas Supabase Auth au démarrage', async () => {
      await useAuthStore().restore()

      expect(repository.restoreSession).not.toHaveBeenCalled()
    })

    it('ne tente pas de rafraîchir une session', async () => {
      await expect(useAuthStore().refresh()).resolves.toBe(false)

      expect(repository.refreshSession).not.toHaveBeenCalled()
    })
  })

  describe('restore', () => {
    beforeEach(() => {
      writePlusAccount({ userId: USER_ID })
    })

    it('part du compte enregistré, session en cours de restauration', () => {
      const store = useAuthStore()

      expect(store.hasPlusAccount).toBe(true)
      expect(store.userId).toBe(USER_ID)
      expect(store.sessionState).toBe('restoring')
    })

    it('restaure la session du compte enregistré', async () => {
      repository.restoreSession.mockResolvedValueOnce({
        kind: 'active',
        session: { userId: USER_ID },
      })
      const store = useAuthStore()

      await store.restore()

      expect(store.sessionState).toBe('active')
    })

    it('garde le compte quand la session expirée attend le réseau', async () => {
      repository.restoreSession.mockResolvedValueOnce({ kind: 'needs-refresh' })
      const store = useAuthStore()

      await store.restore()

      expect(store.sessionState).toBe('needs-refresh')
      expect(store.hasPlusAccount).toBe(true)
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })

    it('garde le compte quand Supabase n’a plus de session', async () => {
      repository.restoreSession.mockResolvedValueOnce({ kind: 'needs-sign-in' })
      const store = useAuthStore()

      await store.restore()

      expect(store.sessionState).toBe('needs-sign-in')
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })

    it('ne laisse pas l’adresse de l’erreur Supabase dans les traces', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      repository.restoreSession.mockRejectedValueOnce(
        Object.assign(new Error('Email sophie.martin@example.com not found'), {
          name: 'AuthApiError',
          code: 'user_not_found',
          status: 400,
        }),
      )

      await useAuthStore().restore()

      const trace = warn.mock.calls.flat().join(' ')
      expect(trace).not.toContain('sophie.martin@example.com')
      expect(trace).toContain('user_not_found')
    })

    it('ne lève pas quand la restauration échoue', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      repository.restoreSession.mockRejectedValueOnce(new Error('client indisponible'))
      const store = useAuthStore()

      await expect(store.restore()).resolves.toBeUndefined()

      expect(store.sessionState).toBe('needs-refresh')
      expect(store.hasPlusAccount).toBe(true)
    })

    it('n’écrase pas une déconnexion survenue pendant la restauration', async () => {
      let answer: (check: Awaited<ReturnType<AuthRepository['restoreSession']>>) => void = () => {}
      repository.restoreSession.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve
        }),
      )
      const store = useAuthStore()

      const restoring = store.restore()
      await store.signOut()
      answer({ kind: 'active', session: { userId: USER_ID } })
      await restoring

      expect(store.sessionState).toBe('none')
      expect(readPlusAccount()).toBeNull()
    })
  })

  describe('session terminée par Supabase', () => {
    it('ne déconnecte pas : le compte reste, une reconnexion est attendue', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.restoreSession.mockResolvedValueOnce({
        kind: 'active',
        session: { userId: USER_ID },
      })
      const store = useAuthStore()
      await store.restore()

      supabaseEndsOrRefreshesSession(null)

      expect(store.sessionState).toBe('needs-sign-in')
      expect(store.hasPlusAccount).toBe(true)
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })

    it('redevient active quand Supabase rafraîchit la session', () => {
      writePlusAccount({ userId: USER_ID })
      const store = useAuthStore()

      supabaseEndsOrRefreshesSession({ userId: USER_ID })

      expect(store.sessionState).toBe('active')
    })

    it('reste sans effet sur un appareil sans compte', () => {
      const store = useAuthStore()

      supabaseEndsOrRefreshesSession({ userId: USER_ID })

      expect(store.sessionState).toBe('none')
      expect(readPlusAccount()).toBeNull()
    })
  })

  describe('refresh', () => {
    beforeEach(() => {
      writePlusAccount({ userId: USER_ID })
    })

    it('réactive la session au retour du réseau', async () => {
      repository.refreshSession.mockResolvedValueOnce({
        kind: 'active',
        session: { userId: USER_ID },
      })
      const store = useAuthStore()

      await expect(store.refresh()).resolves.toBe(true)

      expect(store.sessionState).toBe('active')
    })

    it('reste à rafraîchir tant que le réseau manque, sans lever', async () => {
      repository.refreshSession.mockResolvedValueOnce({ kind: 'needs-refresh' })
      const store = useAuthStore()

      await expect(store.refresh()).resolves.toBe(false)

      expect(store.sessionState).toBe('needs-refresh')
    })
  })

  describe('signIn', () => {
    it('écrit le drapeau à la première connexion réussie', async () => {
      repository.signIn.mockResolvedValueOnce({ userId: USER_ID })
      const store = useAuthStore()

      await store.signIn('gaelle@example.com', 'secret-123')

      expect(repository.signIn).toHaveBeenCalledWith('gaelle@example.com', 'secret-123')
      expect(store.hasPlusAccount).toBe(true)
      expect(store.userId).toBe(USER_ID)
      expect(store.sessionState).toBe('active')
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })

    it('remplace le compte enregistré par celui qui se connecte', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.signIn.mockResolvedValueOnce({ userId: OTHER_USER_ID })
      const store = useAuthStore()

      await store.signIn('autre@example.com', 'secret-123')

      expect(readPlusAccount()).toEqual({ userId: OTHER_USER_ID })
    })

    it('efface l’état d’appareil quand un autre compte prend la main', async () => {
      writePlusAccount({ userId: USER_ID })
      writeDeviceState()
      repository.signIn.mockResolvedValueOnce({ userId: OTHER_USER_ID })
      const store = useAuthStore()

      await store.signIn('autre@example.com', 'secret-123')

      expect(remainingDeviceState()).toEqual(UNRELATED_KEYS)
    })

    it('garde l’achat déjà fait sur l’appareil à la première connexion', async () => {
      writeDeviceState()
      repository.signIn.mockResolvedValueOnce({ userId: USER_ID })
      const store = useAuthStore()

      await store.signIn('gaelle@example.com', 'secret-123')

      expect(remainingDeviceState()).toEqual([...ACCOUNT_KEYS, ...UNRELATED_KEYS])
    })

    it('lève la raison de l’échec sans écrire de drapeau', async () => {
      repository.signIn.mockRejectedValueOnce(new AccountError('invalid-credentials'))
      const store = useAuthStore()

      await expect(store.signIn('gaelle@example.com', 'faux')).rejects.toMatchObject({
        reason: 'invalid-credentials',
      })

      expect(store.hasPlusAccount).toBe(false)
      expect(readPlusAccount()).toBeNull()
    })
  })

  describe('signUp', () => {
    it('écrit le drapeau quand l’inscription ouvre la session', async () => {
      repository.signUp.mockResolvedValueOnce({ kind: 'signed-in', session: { userId: USER_ID } })
      const store = useAuthStore()

      await expect(store.signUp('gaelle@example.com', 'secret-123')).resolves.toBe('signed-in')

      expect(store.sessionState).toBe('active')
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })

    it('n’écrit rien tant que l’e-mail n’est pas confirmé', async () => {
      repository.signUp.mockResolvedValueOnce({ kind: 'confirmation-pending' })
      const store = useAuthStore()

      await expect(store.signUp('gaelle@example.com', 'secret-123')).resolves.toBe(
        'confirmation-pending',
      )

      expect(store.hasPlusAccount).toBe(false)
      expect(readPlusAccount()).toBeNull()
    })

    it('lève la raison de l’échec', async () => {
      repository.signUp.mockRejectedValueOnce(new AccountError('email-taken'))

      await expect(useAuthStore().signUp('gaelle@example.com', 'x')).rejects.toMatchObject({
        reason: 'email-taken',
      })
    })
  })

  describe('signOut', () => {
    it('invalide la session et efface le drapeau', async () => {
      writePlusAccount({ userId: USER_ID })
      const store = useAuthStore()

      await store.signOut()

      expect(repository.signOut).toHaveBeenCalledOnce()
      expect(store.hasPlusAccount).toBe(false)
      expect(store.userId).toBeNull()
      expect(store.sessionState).toBe('none')
      expect(readPlusAccount()).toBeNull()
    })

    it('efface les compteurs d’usage, sans toucher à l’achat ni à la préférence de rappel', async () => {
      writePlusAccount({ userId: USER_ID })
      writeDeviceState()
      const store = useAuthStore()

      await store.signOut()

      expect(remainingDeviceState()).toEqual([
        PLUS_STATUS_STORAGE_KEY,
        PLUS_NUDGE_STORAGE_KEY,
        ...UNRELATED_KEYS,
      ])
    })

    it('laisse l’abonné dans Plus après la déconnexion', async () => {
      writePlusAccount({ userId: USER_ID })
      writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-09-14T10:00:00Z' })
      const purchase = usePurchaseStore()

      await useAuthStore().signOut()

      expect(purchase.status.plan).toBe('annual')
      expect(readStoredPlusStatus().plan).toBe('annual')
    })

    it('ignore la fin de session que Supabase signale pendant la déconnexion', async () => {
      writePlusAccount({ userId: USER_ID })
      const store = useAuthStore()
      repository.signOut.mockImplementationOnce(async () => {
        supabaseEndsOrRefreshesSession(null)
      })

      await store.signOut()

      expect(store.sessionState).toBe('none')
    })
  })
})
