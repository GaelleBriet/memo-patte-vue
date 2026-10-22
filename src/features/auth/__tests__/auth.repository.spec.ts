// @vitest-environment node
import { AuthError, createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_STORAGE_KEY } from '@/core/supabase/auth-storage'

import { AccountError } from '../logic/account-error'
import {
  authRepository,
  createAuthRepository,
  SIGN_OUT_TIMEOUT_MS,
  type AuthRepository,
  type AuthSession,
} from '../repository/auth.repository'
import { memoryStorage, OTHER_USER_ID, USER_ID, type MemoryStorage } from './auth-fixture'

const clientModule = vi.hoisted(() => ({ evaluated: vi.fn<() => void>() }))

vi.mock('@/core/supabase/client', () => {
  clientModule.evaluated()
  return {
    default: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    },
  }
})

type Route = () => Response

const SUPABASE_RETRY_WINDOW_MS = 31_000

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
  })
}

function apiError(status: number, code: string, extra: object = {}): Route {
  return () => json(status, { code, msg: code, ...extra })
}

function userBody(id: string, identities: object[] = [{ id, provider: 'email' }]) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'gaelle@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities,
    created_at: '2026-09-01T10:00:00Z',
  }
}

function sessionBody(userId = USER_ID, expiresInSeconds = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
  return {
    access_token: `access-${userId}-${expiresAt}`,
    token_type: 'bearer',
    expires_in: expiresInSeconds,
    expires_at: expiresAt,
    refresh_token: `refresh-${userId}-${expiresAt}`,
    user: userBody(userId),
  }
}

/** Routes : `signup`, `verify`, `resend`, `logout`, `token:password`, `token:refresh_token`, `token:id_token`. */
function fakeAuthServer() {
  const routes = new Map<string, Route>()
  const calls: string[] = []
  const urls: URL[] = []
  const bodies: unknown[] = []
  let offline = false

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    urls.push(url)
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body))
    const endpoint = url.pathname.replace('/auth/v1/', '')
    const grantType = url.searchParams.get('grant_type')
    const route = grantType ? `${endpoint}:${grantType}` : endpoint
    calls.push(route)
    if (offline) throw new TypeError('Failed to fetch')
    return routes.get(route)?.() ?? new Response(null, { status: 204 })
  }

  return {
    fetch: fakeFetch as typeof fetch,
    calls,
    urls,
    bodies,
    on: (route: string, reply: Route) => void routes.set(route, reply),
    goOffline: () => {
      offline = true
    },
    goOnline: () => {
      offline = false
    },
  }
}

let storage: MemoryStorage
let server: ReturnType<typeof fakeAuthServer>
let loadClient: () => Promise<SupabaseClient>
let repository: AuthRepository

function supabaseClient(auth: { autoRefreshToken?: boolean } = {}): SupabaseClient {
  return createClient('https://memopatte-test.supabase.co', 'sb_publishable_test', {
    global: { fetch: server.fetch },
    auth: { storage, storageKey: AUTH_STORAGE_KEY, ...auth },
  })
}

function storeSession(body: ReturnType<typeof sessionBody>): void {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(body))
}

function storedSessionKeys(): string[] {
  return storage.keys().filter((key) => key.startsWith(AUTH_STORAGE_KEY))
}

function stubClient() {
  const signOut = vi.fn<SupabaseClient['auth']['signOut']>(async () => ({ error: null }))
  return {
    signOut,
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut,
      },
    } as unknown as SupabaseClient,
  }
}

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  server = fakeAuthServer()
  loadClient = vi.fn<() => Promise<SupabaseClient>>(async () =>
    supabaseClient({ autoRefreshToken: false }),
  )
  repository = createAuthRepository({ loadClient })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function reasonOf(operation: Promise<unknown>): Promise<string> {
  const error = await operation.then(
    () => null,
    (cause: unknown) => cause,
  )
  expect(error).toBeInstanceOf(AccountError)
  return (error as AccountError).reason
}

describe('authRepository', () => {
  it('n’évalue le module du client Supabase qu’à la première opération', async () => {
    authRepository.onSessionChange(() => {})
    expect(clientModule.evaluated).not.toHaveBeenCalled()

    await authRepository.restoreSession()

    expect(clientModule.evaluated).toHaveBeenCalledOnce()
  })
})

describe('createAuthRepository', () => {
  it('ne charge pas le client Supabase avant une opération', () => {
    repository.onSessionChange(() => {})

    expect(loadClient).not.toHaveBeenCalled()
  })

  describe('signIn', () => {
    it('ouvre une session persistée et renvoie l’identifiant du compte', async () => {
      server.on('token:password', () => json(200, sessionBody()))

      await expect(repository.signIn('gaelle@example.com', 'secret-123')).resolves.toEqual({
        userId: USER_ID,
      })
      expect(storedSessionKeys()).toContain(AUTH_STORAGE_KEY)
    })

    it.each([
      ['invalid_credentials', 400, 'invalid-credentials'],
      ['email_not_confirmed', 400, 'email-not-confirmed'],
      ['over_request_rate_limit', 429, 'unknown'],
    ])('traduit le code %s', async (code, status, reason) => {
      server.on('token:password', apiError(status, code))

      expect(await reasonOf(repository.signIn('gaelle@example.com', 'secret-123'))).toBe(reason)
    })

    it('signale l’absence de réseau', async () => {
      server.goOffline()

      expect(await reasonOf(repository.signIn('gaelle@example.com', 'secret-123'))).toBe('offline')
    })

    it('ne confond pas une panne du serveur avec l’absence de réseau', async () => {
      server.on('token:password', apiError(503, 'unexpected_failure'))

      expect(await reasonOf(repository.signIn('gaelle@example.com', 'secret-123'))).toBe('unknown')
    })

    it('lève « autre » quand le client ne se charge pas, puis réessaie', async () => {
      const failing = vi
        .fn<() => Promise<SupabaseClient>>()
        .mockRejectedValueOnce(new Error('Configuration Supabase manquante'))
        .mockImplementation(loadClient)
      server.on('token:password', () => json(200, sessionBody()))
      const withFailingLoad = createAuthRepository({ loadClient: failing })

      expect(await reasonOf(withFailingLoad.signIn('gaelle@example.com', 'secret-123'))).toBe(
        'unknown',
      )
      await expect(withFailingLoad.signIn('gaelle@example.com', 'secret-123')).resolves.toEqual({
        userId: USER_ID,
      })
    })
  })

  describe('signInWithGoogleIdToken', () => {
    it('ouvre une session avec le jeton Google et le nonce en clair', async () => {
      server.on('token:id_token', () => json(200, sessionBody()))

      await expect(
        repository.signInWithGoogleIdToken('jeton-google', 'nonce-en-clair'),
      ).resolves.toEqual({ userId: USER_ID })
      expect(server.bodies.at(-1)).toMatchObject({
        provider: 'google',
        id_token: 'jeton-google',
        nonce: 'nonce-en-clair',
      })
      expect(storedSessionKeys()).toContain(AUTH_STORAGE_KEY)
    })

    it('signale l’absence de réseau', async () => {
      server.goOffline()

      expect(await reasonOf(repository.signInWithGoogleIdToken('jeton-google', 'nonce'))).toBe(
        'offline',
      )
    })

    it('lève « autre » quand Supabase refuse le jeton', async () => {
      server.on('token:id_token', apiError(400, 'bad_jwt'))

      expect(await reasonOf(repository.signInWithGoogleIdToken('jeton-google', 'nonce'))).toBe(
        'unknown',
      )
    })
  })

  describe('signUp', () => {
    it('ouvre la session quand la confirmation par e-mail est désactivée', async () => {
      server.on('signup', () => json(200, sessionBody()))

      await expect(repository.signUp('gaelle@example.com', 'secret-123', 'fr')).resolves.toEqual({
        kind: 'signed-in',
        session: { userId: USER_ID },
      })
    })

    it('attend la confirmation quand Supabase ne renvoie pas de session', async () => {
      server.on('signup', () => json(200, userBody(USER_ID)))

      await expect(repository.signUp('gaelle@example.com', 'secret-123', 'fr')).resolves.toEqual({
        kind: 'confirmation-pending',
      })
      expect(storedSessionKeys()).not.toContain(AUTH_STORAGE_KEY)
    })

    it('reconnaît l’e-mail déjà utilisé masqué par la confirmation', async () => {
      server.on('signup', () => json(200, userBody(USER_ID, [])))

      expect(await reasonOf(repository.signUp('gaelle@example.com', 'secret-123', 'fr'))).toBe(
        'email-taken',
      )
    })

    it.each([
      ['email_exists', 'email-taken'],
      ['user_already_exists', 'email-taken'],
      ['weak_password', 'weak-password'],
    ])('traduit le code %s', async (code, reason) => {
      server.on('signup', apiError(422, code, { weak_password: { reasons: ['length'] } }))

      expect(await reasonOf(repository.signUp('gaelle@example.com', 'secret-123', 'fr'))).toBe(
        reason,
      )
    })

    it('transmet la langue de l’app, pour l’e-mail du code', async () => {
      server.on('signup', () => json(200, userBody(USER_ID)))

      await repository.signUp('gaelle@example.com', 'secret-123', 'en')

      expect(server.bodies.at(-1)).toMatchObject({
        email: 'gaelle@example.com',
        data: { locale: 'en' },
      })
    })
  })

  describe('verifySignUpCode', () => {
    it('confirme l’adresse par le code et ouvre une session persistée', async () => {
      server.on('verify', () => json(200, sessionBody()))

      await expect(repository.verifySignUpCode('gaelle@example.com', '123456')).resolves.toEqual({
        userId: USER_ID,
      })
      expect(server.bodies.at(-1)).toMatchObject({
        email: 'gaelle@example.com',
        token: '123456',
        type: 'email',
      })
      expect(storedSessionKeys()).toContain(AUTH_STORAGE_KEY)
    })

    it('lève « code refusé » pour un code faux ou expiré, que Supabase ne distingue pas', async () => {
      server.on('verify', apiError(403, 'otp_expired'))

      expect(await reasonOf(repository.verifySignUpCode('gaelle@example.com', '000000'))).toBe(
        'invalid-code',
      )
    })

    it('signale l’absence de réseau', async () => {
      server.goOffline()

      expect(await reasonOf(repository.verifySignUpCode('gaelle@example.com', '123456'))).toBe(
        'offline',
      )
    })
  })

  describe('sendPasswordResetCode', () => {
    it('demande le code du mot de passe oublié pour l’adresse', async () => {
      server.on('recover', () => json(200, {}))

      await expect(repository.sendPasswordResetCode('gaelle@example.com')).resolves.toBeUndefined()
      expect(server.calls.at(-1)).toBe('recover')
      expect(server.bodies.at(-1)).toMatchObject({ email: 'gaelle@example.com' })
    })

    it('lève « envois trop rapprochés » quand Supabase refuse un e-mail de plus', async () => {
      server.on('recover', apiError(429, 'over_email_send_rate_limit'))

      expect(await reasonOf(repository.sendPasswordResetCode('gaelle@example.com'))).toBe(
        'email-rate-limited',
      )
    })

    it('signale l’absence de réseau', async () => {
      server.goOffline()

      expect(await reasonOf(repository.sendPasswordResetCode('gaelle@example.com'))).toBe('offline')
    })
  })

  describe('verifyPasswordResetCode', () => {
    it('vérifie le code de type « recovery », qui ouvre une session', async () => {
      server.on('verify', () => json(200, sessionBody()))

      await expect(
        repository.verifyPasswordResetCode('gaelle@example.com', '123456'),
      ).resolves.toEqual({ userId: USER_ID })
      expect(server.bodies.at(-1)).toMatchObject({
        email: 'gaelle@example.com',
        token: '123456',
        type: 'recovery',
      })
      expect(storedSessionKeys()).toContain(AUTH_STORAGE_KEY)
    })

    it('lève « code refusé » pour un code faux ou expiré', async () => {
      server.on('verify', apiError(403, 'otp_expired'))

      expect(
        await reasonOf(repository.verifyPasswordResetCode('gaelle@example.com', '000000')),
      ).toBe('invalid-code')
    })
  })

  describe('reauthenticate', () => {
    it('reconnecte le compte de la session avec le mot de passe saisi', async () => {
      storeSession(sessionBody())
      server.on('token:password', () => json(200, sessionBody()))

      await expect(repository.reauthenticate('ancien-secret')).resolves.toEqual({ userId: USER_ID })
      expect(server.bodies.at(-1)).toMatchObject({
        email: 'gaelle@example.com',
        password: 'ancien-secret',
      })
    })

    it('signale un mot de passe faux', async () => {
      storeSession(sessionBody())
      server.on('token:password', apiError(400, 'invalid_credentials'))

      expect(await reasonOf(repository.reauthenticate('faux'))).toBe('invalid-credentials')
    })

    it('lève « autre » sans session, sans rien envoyer', async () => {
      expect(await reasonOf(repository.reauthenticate('ancien-secret'))).toBe('unknown')
      expect(server.calls).toEqual([])
    })
  })

  describe('changement d’adresse (V24 quater à sexies)', () => {
    it('demande le code à la nouvelle adresse', async () => {
      storeSession(sessionBody())
      server.on('user', () => json(200, userBody(USER_ID)))

      await expect(repository.requestEmailChange('sophie2@exemple.fr')).resolves.toBeUndefined()
      expect(server.calls.at(-1)).toBe('user')
      expect(server.bodies.at(-1)).toMatchObject({ email: 'sophie2@exemple.fr' })
    })

    it('lève « adresse déjà prise » quand un autre compte l’a', async () => {
      storeSession(sessionBody())
      server.on('user', apiError(422, 'email_exists'))

      expect(await reasonOf(repository.requestEmailChange('milo@exemple.fr'))).toBe('email-taken')
    })

    it('vérifie le code de type « email_change » et renvoie le compte', async () => {
      storeSession(sessionBody())
      server.on('verify', () => json(200, sessionBody()))

      await expect(
        repository.verifyEmailChangeCode('sophie2@exemple.fr', '123456'),
      ).resolves.toEqual({ userId: USER_ID })
      expect(server.bodies.at(-1)).toMatchObject({
        email: 'sophie2@exemple.fr',
        token: '123456',
        type: 'email_change',
      })
    })

    it('rend « null » quand le code est accepté sans session (premier des deux codes)', async () => {
      storeSession(sessionBody())
      server.on('verify', () => json(200, { msg: 'Confirmation link accepted' }))

      await expect(
        repository.verifyEmailChangeCode('gaelle@example.com', '123456'),
      ).resolves.toBeNull()
      expect(server.bodies.at(-1)).toMatchObject({
        email: 'gaelle@example.com',
        type: 'email_change',
      })
    })

    it('renvoie le code de changement d’adresse', async () => {
      storeSession(sessionBody())
      server.on('resend', () => json(200, {}))

      await repository.resendEmailChangeCode()

      expect(server.bodies.at(-1)).toMatchObject({
        email: 'gaelle@example.com',
        type: 'email_change',
      })
    })

    it('ne renvoie rien sans session', async () => {
      expect(await reasonOf(repository.resendEmailChangeCode())).toBe('unknown')
      expect(server.calls).toEqual([])
    })
  })

  describe('discardSession', () => {
    it('ferme la session de cet appareil seulement', async () => {
      storeSession(sessionBody())

      await repository.discardSession()

      expect(server.urls.at(-1)?.searchParams.get('scope')).toBe('local')
      expect(storedSessionKeys()).toEqual([])
    })

    it('l’efface de l’appareil même sans réseau', async () => {
      storeSession(sessionBody())
      server.goOffline()

      await repository.discardSession()

      expect(storedSessionKeys()).toEqual([])
    })
  })

  describe('updatePassword', () => {
    it('change le mot de passe du compte de la session et renvoie ce compte', async () => {
      storeSession(sessionBody())
      server.on('user', () => json(200, userBody(USER_ID)))

      await expect(repository.updatePassword('nouveau-secret')).resolves.toEqual({
        userId: USER_ID,
      })
      expect(server.calls.at(-1)).toBe('user')
      expect(server.bodies.at(-1)).toMatchObject({ password: 'nouveau-secret' })
      expect(server.bodies.at(-1)).not.toHaveProperty('nonce')
      expect(server.bodies.at(-1)).not.toHaveProperty('current_password')
    })

    it('lève « même mot de passe » quand Supabase refuse l’actuel', async () => {
      storeSession(sessionBody())
      server.on('user', apiError(422, 'same_password'))

      expect(await reasonOf(repository.updatePassword('ancien-secret'))).toBe('same-password')
    })

    it('lève « mot de passe trop faible » quand Supabase le refuse', async () => {
      storeSession(sessionBody())
      server.on('user', apiError(422, 'weak_password'))

      expect(await reasonOf(repository.updatePassword('12345678'))).toBe('weak-password')
    })

    it('lève « autre » sans session sur l’appareil', async () => {
      expect(await reasonOf(repository.updatePassword('nouveau-secret'))).toBe('unknown')
    })
  })

  describe('resendSignUpCode', () => {
    it('redemande le code d’inscription pour l’adresse', async () => {
      server.on('resend', () => json(200, {}))

      await expect(repository.resendSignUpCode('gaelle@example.com')).resolves.toBeUndefined()
      expect(server.calls.at(-1)).toBe('resend')
      expect(server.bodies.at(-1)).toMatchObject({ email: 'gaelle@example.com', type: 'signup' })
    })

    it('lève « envois trop rapprochés » quand Supabase refuse un e-mail de plus', async () => {
      server.on('resend', apiError(429, 'over_email_send_rate_limit'))

      expect(await reasonOf(repository.resendSignUpCode('gaelle@example.com'))).toBe(
        'email-rate-limited',
      )
    })

    it('signale l’absence de réseau', async () => {
      server.goOffline()

      expect(await reasonOf(repository.resendSignUpCode('gaelle@example.com'))).toBe('offline')
    })
  })

  describe('restoreSession', () => {
    it('restaure une session valide sans appel réseau', async () => {
      storeSession(sessionBody())

      await expect(repository.restoreSession()).resolves.toEqual({
        kind: 'active',
        session: { userId: USER_ID },
      })
      expect(server.calls).toEqual([])
    })

    it('garde une session expirée hors ligne, à rafraîchir plus tard', async () => {
      vi.useFakeTimers()
      storeSession(sessionBody(USER_ID, -60))
      server.goOffline()

      const check = repository.restoreSession()
      await vi.advanceTimersByTimeAsync(SUPABASE_RETRY_WINDOW_MS)

      await expect(check).resolves.toEqual({ kind: 'needs-refresh' })
      expect(storedSessionKeys()).toContain(AUTH_STORAGE_KEY)
    })

    it('redevient active d’elle-même au retour du réseau', async () => {
      vi.useFakeTimers()
      const autoRefreshing = createAuthRepository({ loadClient: async () => supabaseClient() })
      const listener = vi.fn<(session: AuthSession | null) => void>()
      autoRefreshing.onSessionChange(listener)
      storeSession(sessionBody(USER_ID, -60))
      server.goOffline()
      const check = autoRefreshing.restoreSession()
      await vi.advanceTimersByTimeAsync(SUPABASE_RETRY_WINDOW_MS)
      await expect(check).resolves.toEqual({ kind: 'needs-refresh' })

      server.goOnline()
      server.on('token:refresh_token', () => json(200, sessionBody()))
      await vi.advanceTimersByTimeAsync(3 * SUPABASE_RETRY_WINDOW_MS)

      expect(listener).toHaveBeenLastCalledWith({ userId: USER_ID })
      await expect(autoRefreshing.restoreSession()).resolves.toEqual({
        kind: 'active',
        session: { userId: USER_ID },
      })
    })

    it('demande une reconnexion quand Supabase refuse le jeton de rafraîchissement', async () => {
      storeSession(sessionBody(USER_ID, -60))
      server.on('token:refresh_token', apiError(400, 'refresh_token_not_found'))

      await expect(repository.restoreSession()).resolves.toEqual({ kind: 'needs-sign-in' })
    })

    it('demande une reconnexion quand aucune session n’est enregistrée', async () => {
      await expect(repository.restoreSession()).resolves.toEqual({ kind: 'needs-sign-in' })
    })
  })

  describe('accountIdentity', () => {
    const GOOGLE_SUBJECT = '108234567890'
    const googleIdentity = {
      id: GOOGLE_SUBJECT,
      provider: 'google',
      identity_data: { sub: GOOGLE_SUBJECT, email: 'sophie@gmail.com' },
    }

    function storeAccount(providers: string[], email: string, identities: object[]): void {
      const body = sessionBody()
      const app_metadata = { provider: providers[0], providers }
      const user = { ...body.user, email, app_metadata, identities }
      storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...body, user }))
    }

    it('donne l’adresse d’un compte qui a un mot de passe, sans appel réseau', async () => {
      storeAccount(['email'], 'sophie@exemple.fr', [{ id: USER_ID, provider: 'email' }])

      await expect(repository.accountIdentity()).resolves.toEqual({
        kind: 'password',
        email: 'sophie@exemple.fr',
      })
      expect(server.calls).toEqual([])
    })

    it('reste un compte à mot de passe quand il a aussi Google', async () => {
      storeAccount(['email', 'google'], 'sophie@exemple.fr', [
        { id: USER_ID, provider: 'email' },
        googleIdentity,
      ])

      await expect(repository.accountIdentity()).resolves.toEqual({
        kind: 'password',
        email: 'sophie@exemple.fr',
      })
    })

    it('donne l’adresse Google d’un compte créé avec Google', async () => {
      storeAccount(['google'], 'sophie@gmail.com', [googleIdentity])

      await expect(repository.accountIdentity()).resolves.toEqual({
        kind: 'google',
        email: 'sophie@gmail.com',
        subject: GOOGLE_SUBJECT,
      })
    })

    it('ne donne rien sans session sur l’appareil', async () => {
      await expect(repository.accountIdentity()).resolves.toBeNull()
    })
  })

  describe('refreshSession', () => {
    it('rafraîchit une session expirée au retour du réseau', async () => {
      storeSession(sessionBody(USER_ID, -60))
      server.on('token:refresh_token', () => json(200, sessionBody()))

      await expect(repository.refreshSession()).resolves.toEqual({
        kind: 'active',
        session: { userId: USER_ID },
      })
      expect(server.calls).toContain('token:refresh_token')
    })

    it('garde une session encore valide dont le rafraîchissement est refusé', async () => {
      storeSession(sessionBody())
      server.on('token:refresh_token', apiError(400, 'refresh_token_already_used'))

      await expect(repository.refreshSession()).resolves.toEqual({
        kind: 'active',
        session: { userId: USER_ID },
      })
    })

    it('demande une reconnexion quand le rafraîchissement d’une session expirée est refusé', async () => {
      storeSession(sessionBody(USER_ID, -60))
      server.on('token:refresh_token', apiError(400, 'refresh_token_not_found'))

      await expect(repository.refreshSession()).resolves.toEqual({ kind: 'needs-sign-in' })
    })

    it('reste à rafraîchir hors ligne', async () => {
      vi.useFakeTimers()
      storeSession(sessionBody())
      server.goOffline()

      const check = repository.refreshSession()
      await vi.advanceTimersByTimeAsync(SUPABASE_RETRY_WINDOW_MS)

      await expect(check).resolves.toEqual({ kind: 'needs-refresh' })
    })
  })

  describe('signOut', () => {
    it('invalide la session auprès de Supabase et l’efface de l’appareil', async () => {
      storeSession(sessionBody())

      await repository.signOut()

      expect(server.calls).toContain('logout')
      expect(storedSessionKeys()).toEqual([])
    })

    it('efface la session de l’appareil même hors ligne', async () => {
      storeSession(sessionBody())
      server.goOffline()

      await expect(repository.signOut()).resolves.toBeUndefined()

      expect(storedSessionKeys()).toEqual([])
    })

    it('efface sans attendre une session expirée hors ligne, sans la ressusciter ensuite', async () => {
      vi.useFakeTimers()
      storeSession(sessionBody(USER_ID, -60))
      server.goOffline()

      const signingOut = repository.signOut()
      await vi.advanceTimersByTimeAsync(SIGN_OUT_TIMEOUT_MS)
      await signingOut

      expect(storedSessionKeys()).toEqual([])
      server.goOnline()
      server.on('token:refresh_token', () => json(200, sessionBody()))
      await vi.advanceTimersByTimeAsync(SUPABASE_RETRY_WINDOW_MS)
      expect(server.calls.filter((call) => call === 'token:refresh_token').length).toBeGreaterThan(
        1,
      )
      expect(storedSessionKeys()).toEqual([])
    })

    it('efface aussi les vérifieurs PKCE en attente', async () => {
      vi.useFakeTimers()
      storeSession(sessionBody(USER_ID, -60))
      storage.setItem(
        `${AUTH_STORAGE_KEY}-flows-code-verifier`,
        JSON.stringify(['flow-a', 'flow-b']),
      )
      storage.setItem(`${AUTH_STORAGE_KEY}-flow-flow-a-code-verifier`, 'a')
      storage.setItem(`${AUTH_STORAGE_KEY}-flow-flow-b-code-verifier`, 'b')
      storage.setItem(`${AUTH_STORAGE_KEY}-code-verifier`, 'ancien')
      server.goOffline()

      const signingOut = repository.signOut()
      await vi.advanceTimersByTimeAsync(SIGN_OUT_TIMEOUT_MS)
      await signingOut

      expect(storedSessionKeys()).toEqual([])
    })

    it('ne lève pas quand le stockage refuse l’effacement', async () => {
      vi.useFakeTimers()
      storeSession(sessionBody(USER_ID, -60))
      server.goOffline()
      vi.spyOn(storage, 'removeItem').mockImplementation(() => {
        throw new DOMException('bloqué', 'SecurityError')
      })

      const signingOut = repository.signOut()
      await vi.advanceTimersByTimeAsync(SIGN_OUT_TIMEOUT_MS)

      await expect(signingOut).resolves.toBeUndefined()
    })

    it('révoque le jeton de rafraîchissement, pas seulement sur cet appareil', async () => {
      storeSession(sessionBody())

      await repository.signOut()

      expect(server.urls.find((url) => url.pathname.endsWith('/logout'))?.search).toBe(
        '?scope=global',
      )
    })

    it('ne journalise que le nom, le code et le statut de l’échec', async () => {
      const client = stubClient()
      client.signOut.mockResolvedValue({
        error: Object.assign(new AuthError('Email sophie.martin@example.com not found', 422), {
          code: 'user_not_found',
          body: { msg: 'sophie.martin@example.com' },
        }),
      })

      await createAuthRepository({ loadClient: async () => client.supabase }).signOut()

      const trace = vi.mocked(console.warn).mock.calls.flat().join(' ')
      expect(trace).not.toContain('sophie.martin@example.com')
      expect(trace).toContain('user_not_found')
    })

    it('retombe sur la révocation locale quand la révocation globale échoue', async () => {
      const client = stubClient()
      client.signOut.mockResolvedValueOnce({ error: new AuthError('panne') })

      await createAuthRepository({ loadClient: async () => client.supabase }).signOut()

      expect(client.signOut.mock.calls.map(([options]) => options?.scope)).toEqual([
        'global',
        'local',
      ])
    })

    it('rend la main au bout d’un seul délai, les deux révocations comprises', async () => {
      vi.useFakeTimers()
      storeSession(sessionBody())
      const client = stubClient()
      client.signOut.mockReturnValue(new Promise(() => {}))

      const signingOut = createAuthRepository({ loadClient: async () => client.supabase }).signOut()
      await vi.advanceTimersByTimeAsync(SIGN_OUT_TIMEOUT_MS)

      await expect(signingOut).resolves.toBeUndefined()
      expect(client.signOut.mock.calls.map(([options]) => options?.scope)).toEqual([
        'global',
        'local',
      ])
      expect(storedSessionKeys()).toEqual([])
    })
  })

  describe('onSessionChange', () => {
    it('signale la fin d’une session décidée par Supabase', async () => {
      storeSession(sessionBody(USER_ID, -60))
      server.on('token:refresh_token', apiError(400, 'refresh_token_already_used'))
      const listener = vi.fn<(session: AuthSession | null) => void>()
      repository.onSessionChange(listener)

      await repository.restoreSession()

      expect(listener).toHaveBeenLastCalledWith(null)
    })

    it('signale une session rafraîchie ou ouverte', async () => {
      storeSession(sessionBody(USER_ID, -60))
      server.on('token:refresh_token', () => json(200, sessionBody(OTHER_USER_ID)))
      const listener = vi.fn<(session: AuthSession | null) => void>()
      repository.onSessionChange(listener)

      await repository.refreshSession()

      expect(listener).toHaveBeenLastCalledWith({ userId: OTHER_USER_ID })
    })
  })
})
