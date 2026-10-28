// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { identify, reset as resetAnalytics } from '@/core/analytics'
import { ANALYTICS_CONSENT_KEY } from '@/core/analytics/analytics'
import { PLUS_NUDGE_STORAGE_KEY } from '@/features/purchase/logic/plus-nudge'
import {
  PLUS_STATUS_STORAGE_KEY,
  readStoredPlusStatus,
  writeStoredPlusStatus,
} from '@/features/purchase/logic/plus-status-storage'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { USAGE_SIGNALS_STORAGE_KEY } from '@/core/usage/usage-signals'

import { AccountError } from '../logic/account-error'
import { CODE_LENGTH } from '../logic/email-code'
import {
  authRepository,
  type AuthRepository,
  type AuthSession,
} from '../repository/auth.repository'
import { googleCredentials } from '@/core/google-sign-in/google-credentials'
import { signInWithGoogle } from '../service/google-sign-in.service'
import { provideAuthRepository, useAuthStore } from '../store/auth.store'
import { readPlusAccount, writePlusAccount } from '../logic/plus-account-storage'
import { readSessionReset, writeSessionReset } from '../logic/session-reset-flag'
import { memoryStorage, OTHER_USER_ID, USER_ID } from './auth-fixture'

const ACCOUNT_KEYS = [PLUS_STATUS_STORAGE_KEY, PLUS_NUDGE_STORAGE_KEY, USAGE_SIGNALS_STORAGE_KEY]
const UNRELATED_KEYS = [ANALYTICS_CONSENT_KEY, 'memopatte.notifications.primingAnswered']

function writeDeviceState(): void {
  for (const key of [...ACCOUNT_KEYS, ...UNRELATED_KEYS]) localStorage.setItem(key, '{}')
}

function remainingDeviceState(): string[] {
  return [...ACCOUNT_KEYS, ...UNRELATED_KEYS].filter((key) => localStorage.getItem(key) !== null)
}

vi.mock('@/core/analytics', () => ({
  identify: vi.fn<(distinctId: string) => void>(),
  reset: vi.fn<() => void>(),
}))

vi.mock('../repository/auth.repository', () => ({
  authRepository: {
    signUp: vi.fn<AuthRepository['signUp']>(),
    verifySignUpCode: vi.fn<AuthRepository['verifySignUpCode']>(),
    resendSignUpCode: vi.fn<AuthRepository['resendSignUpCode']>(async () => {}),
    sendPasswordResetCode: vi.fn<AuthRepository['sendPasswordResetCode']>(async () => {}),
    verifyPasswordResetCode: vi.fn<AuthRepository['verifyPasswordResetCode']>(),
    discardSession: vi.fn<AuthRepository['discardSession']>(async () => {}),
    updatePassword: vi.fn<AuthRepository['updatePassword']>(),
    reauthenticate: vi.fn<AuthRepository['reauthenticate']>(),
    requestEmailChange: vi.fn<AuthRepository['requestEmailChange']>(async () => {}),
    verifyEmailChangeCode: vi.fn<AuthRepository['verifyEmailChangeCode']>(),
    resendEmailChangeCode: vi.fn<AuthRepository['resendEmailChangeCode']>(async () => {}),
    signIn: vi.fn<AuthRepository['signIn']>(),
    signInWithGoogleIdToken: vi.fn<AuthRepository['signInWithGoogleIdToken']>(),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
    restoreSession: vi.fn<AuthRepository['restoreSession']>(),
    refreshSession: vi.fn<AuthRepository['refreshSession']>(),
    accountIdentity: vi.fn<AuthRepository['accountIdentity']>(),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
    onSessionUnreadable: vi.fn<AuthRepository['onSessionUnreadable']>(),
  },
}))

vi.mock('@/core/google-sign-in/google-credentials', () => ({
  googleCredentials: { signOut: vi.fn<() => Promise<void>>(async () => {}) },
}))

vi.mock('../service/google-sign-in.service', () => ({
  signInWithGoogle: vi.fn<typeof signInWithGoogle>(),
}))

const repository = vi.mocked(authRepository)
const googleSignIn = vi.mocked(signInWithGoogle)
const forgetGoogleAccount = vi.mocked(googleCredentials.signOut)
provideAuthRepository(() => authRepository)

function supabaseEndsOrRefreshesSession(session: AuthSession | null): void {
  const listener = repository.onSessionChange.mock.lastCall?.[0]
  if (!listener) throw new Error('le store n’écoute pas la session')
  listener(session)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-15T10:00:00Z') })
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
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

    it('signale une session illisible et demande de se reconnecter', async () => {
      repository.restoreSession.mockResolvedValueOnce({
        kind: 'active',
        session: { userId: USER_ID },
      })
      const store = useAuthStore()
      await store.restore()
      expect(store.sessionUnreadable).toBe(false)

      repository.onSessionUnreadable.mock.lastCall?.[0]()

      expect(store.sessionUnreadable).toBe(true)
      expect(store.sessionState).toBe('needs-sign-in')
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
      expect(readSessionReset()).toBe(true)
    })

    it('garde le signal après un redémarrage, jusqu’à la prochaine connexion réussie', async () => {
      writeSessionReset()
      repository.restoreSession.mockResolvedValueOnce({ kind: 'needs-sign-in' })
      const store = useAuthStore()
      await store.restore()
      expect(store.sessionUnreadable).toBe(true)

      supabaseEndsOrRefreshesSession({ userId: USER_ID })

      expect(store.sessionUnreadable).toBe(false)
      expect(readSessionReset()).toBe(false)
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

    it('identifie le compte auprès des statistiques', async () => {
      repository.signIn.mockResolvedValueOnce({ userId: USER_ID })

      await useAuthStore().signIn('gaelle@example.com', 'secret-123')

      expect(identify).toHaveBeenCalledWith(USER_ID)
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

  describe('signInWithGoogle', () => {
    it('écrit le drapeau et identifie le compte quand Google ouvre la session', async () => {
      googleSignIn.mockResolvedValueOnce({ kind: 'signed-in', session: { userId: USER_ID } })
      const store = useAuthStore()

      await expect(store.signInWithGoogle()).resolves.toBe('signed-in')

      expect(googleSignIn).toHaveBeenCalledWith(authRepository)
      expect(store.sessionState).toBe('active')
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
      expect(identify).toHaveBeenCalledWith(USER_ID)
    })

    it('efface l’état d’appareil quand un autre compte prend la main', async () => {
      writePlusAccount({ userId: USER_ID })
      writeDeviceState()
      googleSignIn.mockResolvedValueOnce({ kind: 'signed-in', session: { userId: OTHER_USER_ID } })

      await useAuthStore().signInWithGoogle()

      expect(readPlusAccount()).toEqual({ userId: OTHER_USER_ID })
      expect(remainingDeviceState()).toEqual(UNRELATED_KEYS)
    })

    it('ne change rien quand la personne ferme le choix du compte', async () => {
      googleSignIn.mockResolvedValueOnce({ kind: 'cancelled' })
      const store = useAuthStore()

      await expect(store.signInWithGoogle()).resolves.toBe('cancelled')

      expect(store.hasPlusAccount).toBe(false)
      expect(store.sessionState).toBe('none')
      expect(readPlusAccount()).toBeNull()
      expect(identify).not.toHaveBeenCalled()
    })

    it('lève l’échec sans écrire de drapeau', async () => {
      googleSignIn.mockRejectedValueOnce(new AccountError('offline'))
      const store = useAuthStore()

      await expect(store.signInWithGoogle()).rejects.toMatchObject({ reason: 'offline' })

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

    it('identifie le compte auprès des statistiques quand la session s’ouvre', async () => {
      repository.signUp.mockResolvedValueOnce({ kind: 'signed-in', session: { userId: USER_ID } })

      await useAuthStore().signUp('gaelle@example.com', 'secret-123')

      expect(identify).toHaveBeenCalledWith(USER_ID)
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

    it('demande l’e-mail du code dans la langue de l’app', async () => {
      repository.signUp.mockResolvedValueOnce({ kind: 'confirmation-pending' })

      await useAuthStore().signUp('gaelle@example.com', 'secret-123')

      expect(repository.signUp).toHaveBeenCalledWith('gaelle@example.com', 'secret-123', 'fr')
    })
  })

  describe('verifySignUpCode', () => {
    it('écrit le compte et ouvre la session quand le code est bon', async () => {
      repository.verifySignUpCode.mockResolvedValueOnce({ userId: USER_ID })
      const store = useAuthStore()

      await store.verifySignUpCode('gaelle@example.com', '123456')

      expect(repository.verifySignUpCode).toHaveBeenCalledWith('gaelle@example.com', '123456')
      expect(store.sessionState).toBe('active')
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
      expect(identify).toHaveBeenCalledWith(USER_ID)
    })

    it('n’écrit rien quand le code est refusé', async () => {
      repository.verifySignUpCode.mockRejectedValueOnce(new AccountError('invalid-code'))
      const store = useAuthStore()

      await expect(store.verifySignUpCode('gaelle@example.com', '000000')).rejects.toMatchObject({
        reason: 'invalid-code',
      })
      expect(store.hasPlusAccount).toBe(false)
      expect(readPlusAccount()).toBeNull()
    })
  })

  describe('resendSignUpCode', () => {
    it('redemande le code sans rien écrire', async () => {
      const store = useAuthStore()

      await store.resendSignUpCode('gaelle@example.com')

      expect(repository.resendSignUpCode).toHaveBeenCalledWith('gaelle@example.com')
      expect(store.hasPlusAccount).toBe(false)
    })
  })

  describe('mot de passe oublié', () => {
    it('demande le code sans rien écrire', async () => {
      const store = useAuthStore()

      await store.sendPasswordResetCode('gaelle@example.com')

      expect(repository.sendPasswordResetCode).toHaveBeenCalledWith('gaelle@example.com')
      expect(store.hasPlusAccount).toBe(false)
    })

    it('vérifie le code sans ouvrir le compte : le mot de passe n’est pas encore changé', async () => {
      repository.verifyPasswordResetCode.mockResolvedValue({ userId: USER_ID })
      const store = useAuthStore()

      await store.verifyPasswordResetCode('gaelle@example.com', '123456')

      expect(repository.verifyPasswordResetCode).toHaveBeenCalledWith(
        'gaelle@example.com',
        '123456',
      )
      expect(store.hasPlusAccount).toBe(false)
      expect(readPlusAccount()).toBeNull()
    })

    it('ouvre le compte une fois le nouveau mot de passe enregistré', async () => {
      repository.updatePassword.mockResolvedValue({ userId: USER_ID })
      const store = useAuthStore()

      await store.changePassword('nouveau-secret')

      expect(repository.updatePassword).toHaveBeenCalledWith('nouveau-secret')
      expect(store.hasPlusAccount).toBe(true)
      expect(store.sessionState).toBe('active')
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
      expect(identify).toHaveBeenCalledWith(USER_ID)
    })

    it('n’ouvre rien quand le mot de passe est refusé', async () => {
      repository.updatePassword.mockRejectedValue(new AccountError('same-password'))
      const store = useAuthStore()

      await expect(store.changePassword('ancien-secret')).rejects.toThrow(AccountError)
      expect(store.hasPlusAccount).toBe(false)
    })
  })

  describe('changer de mot de passe (V24 ter)', () => {
    it('reconnecte avec l’actuel puis enregistre le nouveau, sans code', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.reauthenticate.mockResolvedValue({ userId: USER_ID })
      repository.updatePassword.mockResolvedValue({ userId: USER_ID })
      const store = useAuthStore()

      await store.changePasswordWithCurrent('ancien-secret', 'nouveau-secret')

      expect(repository.reauthenticate).toHaveBeenCalledWith('ancien-secret')
      expect(repository.updatePassword).toHaveBeenCalledWith('nouveau-secret', 'ancien-secret')
      expect(repository.reauthenticate.mock.invocationCallOrder[0]).toBeLessThan(
        repository.updatePassword.mock.invocationCallOrder[0]!,
      )
    })

    it('ne change rien quand l’actuel est faux', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.reauthenticate.mockRejectedValue(new AccountError('invalid-credentials'))
      const store = useAuthStore()

      await expect(store.changePasswordWithCurrent('faux', 'nouveau-secret')).rejects.toMatchObject(
        { reason: 'invalid-credentials' },
      )
      expect(repository.updatePassword).not.toHaveBeenCalled()
    })
  })

  describe('changer d’adresse (V24 quater à sexies)', () => {
    it('reconnecte avec le mot de passe puis demande le code à la nouvelle adresse', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.reauthenticate.mockResolvedValue({ userId: USER_ID })
      const store = useAuthStore()

      await store.requestEmailChange('ancien-secret', 'sophie2@exemple.fr')

      expect(repository.reauthenticate).toHaveBeenCalledWith('ancien-secret')
      expect(repository.requestEmailChange).toHaveBeenCalledWith('sophie2@exemple.fr')
    })

    it('ne demande rien quand le mot de passe est faux', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.reauthenticate.mockRejectedValue(new AccountError('invalid-credentials'))
      const store = useAuthStore()

      await expect(store.requestEmailChange('faux', 'sophie2@exemple.fr')).rejects.toMatchObject({
        reason: 'invalid-credentials',
      })
      expect(repository.requestEmailChange).not.toHaveBeenCalled()
    })

    it('garde le compte de l’appareil une fois le code vérifié', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.verifyEmailChangeCode.mockResolvedValue({ userId: USER_ID })
      const store = useAuthStore()

      await expect(
        store.verifyEmailChangeCode('sophie2@exemple.fr', '1'.repeat(CODE_LENGTH), true),
      ).resolves.toBe(true)

      expect(store.sessionState).toBe('active')
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })

    it('rend « false » pour le premier code, sans toucher au compte', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.verifyEmailChangeCode.mockResolvedValue(null)
      const store = useAuthStore()

      await expect(
        store.verifyEmailChangeCode('sophie@exemple.fr', '1'.repeat(CODE_LENGTH), false),
      ).resolves.toBe(false)
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })

    it('écarte la session d’un autre compte reçue au second code, sans toucher au compte de l’appareil', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.verifyEmailChangeCode.mockResolvedValue({ userId: OTHER_USER_ID })
      const store = useAuthStore()

      await expect(
        store.verifyEmailChangeCode('sophie2@exemple.fr', '1'.repeat(CODE_LENGTH), true),
      ).rejects.toMatchObject({ reason: 'unknown' })

      expect(repository.discardSession).toHaveBeenCalledOnce()
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })

    it('lève une erreur quand le second code répond sans session', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.verifyEmailChangeCode.mockResolvedValue(null)
      const store = useAuthStore()

      await expect(
        store.verifyEmailChangeCode('sophie2@exemple.fr', '1'.repeat(CODE_LENGTH), true),
      ).rejects.toMatchObject({ reason: 'unknown' })
    })
  })

  describe('accountIdentity', () => {
    it('donne l’adresse du compte lue sur l’appareil', async () => {
      repository.accountIdentity.mockResolvedValue({ kind: 'password', email: 'sophie@exemple.fr' })

      await expect(useAuthStore().accountIdentity()).resolves.toEqual({
        kind: 'password',
        email: 'sophie@exemple.fr',
      })
    })

    it('ne lève pas : rien à montrer quand la session est illisible', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      repository.accountIdentity.mockRejectedValue(new AccountError('unknown'))

      await expect(useAuthStore().accountIdentity()).resolves.toBeNull()
      expect(warn).toHaveBeenCalledOnce()
    })
  })

  describe('code de récupération abandonné', () => {
    it('ferme la session récupérée quand l’appareil n’a pas de compte', async () => {
      repository.verifyPasswordResetCode.mockResolvedValue({ userId: OTHER_USER_ID })
      const store = useAuthStore()

      await store.verifyPasswordResetCode('milo@exemple.fr', '123456')
      await store.abandonPasswordReset()

      expect(repository.discardSession).toHaveBeenCalledOnce()
    })

    it('garde la session quand c’est le compte de l’appareil', async () => {
      writePlusAccount({ userId: USER_ID })
      repository.verifyPasswordResetCode.mockResolvedValue({ userId: USER_ID })
      const store = useAuthStore()

      await store.verifyPasswordResetCode('gaelle@example.com', '123456')
      await store.abandonPasswordReset()

      expect(repository.discardSession).not.toHaveBeenCalled()
    })

    it('ne ferme rien une fois le mot de passe changé', async () => {
      repository.verifyPasswordResetCode.mockResolvedValue({ userId: OTHER_USER_ID })
      repository.updatePassword.mockResolvedValue({ userId: OTHER_USER_ID })
      const store = useAuthStore()

      await store.verifyPasswordResetCode('milo@exemple.fr', '123456')
      await store.changePassword('nouveau-secret')
      await store.abandonPasswordReset()

      expect(repository.discardSession).not.toHaveBeenCalled()
    })

    it('ne laisse pas une session d’un autre compte prendre la main sans connexion', () => {
      writePlusAccount({ userId: USER_ID })
      const store = useAuthStore()

      supabaseEndsOrRefreshesSession({ userId: OTHER_USER_ID })

      expect(store.userId).toBe(USER_ID)
      expect(readPlusAccount()).toEqual({ userId: USER_ID })
    })
  })

  describe('signOut', () => {
    it('invalide la session et efface le drapeau', async () => {
      writePlusAccount({ userId: USER_ID })
      const store = useAuthStore()

      await store.signOut()

      expect(repository.signOut).toHaveBeenCalledOnce()
      expect(forgetGoogleAccount).toHaveBeenCalledOnce()
      expect(store.hasPlusAccount).toBe(false)
      expect(store.userId).toBeNull()
      expect(store.sessionState).toBe('none')
      expect(readPlusAccount()).toBeNull()
    })

    it('réinitialise l’identité auprès des statistiques', async () => {
      writePlusAccount({ userId: USER_ID })

      await useAuthStore().signOut()

      expect(resetAnalytics).toHaveBeenCalledOnce()
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

  describe('forgetDeletedAccount', () => {
    it('efface la session et le compte de l’appareil, comme la déconnexion', async () => {
      writePlusAccount({ userId: USER_ID })
      const store = useAuthStore()

      await store.forgetDeletedAccount()

      expect(repository.signOut).toHaveBeenCalledOnce()
      expect(forgetGoogleAccount).toHaveBeenCalledOnce()
      expect(resetAnalytics).toHaveBeenCalledOnce()
      expect(store.hasPlusAccount).toBe(false)
      expect(store.userId).toBeNull()
      expect(store.sessionState).toBe('none')
      expect(readPlusAccount()).toBeNull()
    })

    it('rend l’app gratuite : l’achat et ses rappels sont oubliés', async () => {
      writePlusAccount({ userId: USER_ID })
      writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-03-03T10:00:00Z' })
      writeDeviceState()
      const purchase = usePurchaseStore()

      await useAuthStore().forgetDeletedAccount()

      expect(purchase.status.plan).toBe('none')
      expect(readStoredPlusStatus().plan).toBe('none')
      expect(remainingDeviceState()).toEqual(UNRELATED_KEYS)
    })
  })
})
