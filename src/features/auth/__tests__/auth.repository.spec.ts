// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_STORAGE_KEY } from '@/core/supabase/auth-storage'

import { AccountError } from '../account-error'
import {
  authRepository,
  createAuthRepository,
  SIGN_OUT_TIMEOUT_MS,
  type AuthRepository,
  type AuthSession,
} from '../auth.repository'
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

/** Routes : `signup`, `logout`, `token:password`, `token:refresh_token`. */
function fakeAuthServer() {
  const routes = new Map<string, Route>()
  const calls: string[] = []
  const urls: URL[] = []
  let offline = false

  const fakeFetch = async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    urls.push(url)
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
    on: (route: string, reply: Route) => void routes.set(route, reply),
    goOffline: () => {
      offline = true
    },
  }
}

let storage: MemoryStorage
let server: ReturnType<typeof fakeAuthServer>
let loadClient: () => Promise<SupabaseClient>
let repository: AuthRepository

function storeSession(body: ReturnType<typeof sessionBody>): void {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(body))
}

function storedSessionKeys(): string[] {
  return storage.keys().filter((key) => key.startsWith(AUTH_STORAGE_KEY))
}

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  server = fakeAuthServer()
  loadClient = vi.fn<() => Promise<SupabaseClient>>(async () =>
    createClient('https://memopatte-test.supabase.co', 'sb_publishable_test', {
      global: { fetch: server.fetch },
      auth: { storage, storageKey: AUTH_STORAGE_KEY, autoRefreshToken: false },
    }),
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

  describe('signUp', () => {
    it('ouvre la session quand la confirmation par e-mail est désactivée', async () => {
      server.on('signup', () => json(200, sessionBody()))

      await expect(repository.signUp('gaelle@example.com', 'secret-123')).resolves.toEqual({
        kind: 'signed-in',
        session: { userId: USER_ID },
      })
    })

    it('attend la confirmation quand Supabase ne renvoie pas de session', async () => {
      server.on('signup', () => json(200, userBody(USER_ID)))

      await expect(repository.signUp('gaelle@example.com', 'secret-123')).resolves.toEqual({
        kind: 'confirmation-pending',
      })
      expect(storedSessionKeys()).not.toContain(AUTH_STORAGE_KEY)
    })

    it('reconnaît l’e-mail déjà utilisé masqué par la confirmation', async () => {
      server.on('signup', () => json(200, userBody(USER_ID, [])))

      expect(await reasonOf(repository.signUp('gaelle@example.com', 'secret-123'))).toBe(
        'email-taken',
      )
    })

    it.each([
      ['email_exists', 'email-taken'],
      ['user_already_exists', 'email-taken'],
      ['weak_password', 'weak-password'],
    ])('traduit le code %s', async (code, reason) => {
      server.on('signup', apiError(422, code, { weak_password: { reasons: ['length'] } }))

      expect(await reasonOf(repository.signUp('gaelle@example.com', 'secret-123'))).toBe(reason)
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

    it('demande une reconnexion quand Supabase refuse le jeton de rafraîchissement', async () => {
      storeSession(sessionBody(USER_ID, -60))
      server.on('token:refresh_token', apiError(400, 'refresh_token_not_found'))

      await expect(repository.restoreSession()).resolves.toEqual({ kind: 'needs-sign-in' })
    })

    it('demande une reconnexion quand aucune session n’est enregistrée', async () => {
      await expect(repository.restoreSession()).resolves.toEqual({ kind: 'needs-sign-in' })
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
      await vi.advanceTimersByTimeAsync(SUPABASE_RETRY_WINDOW_MS)
      expect(storedSessionKeys()).toEqual([])
    })

    it('n’invalide que la session de cet appareil', async () => {
      storeSession(sessionBody())

      await repository.signOut()

      expect(server.urls.find((url) => url.pathname.endsWith('/logout'))?.search).toBe(
        '?scope=local',
      )
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
