// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_STORAGE_KEY } from '@/core/supabase/auth-storage'

import { AccountDeletionError } from '../logic/account-deletion-error'
import { AccountError } from '../logic/account-error'
import {
  createAccountDeletionRepository,
  type AccountDeletionRepository,
} from '../repository/account-deletion.repository'
import { memoryStorage, OTHER_USER_ID, USER_ID, type MemoryStorage } from './auth-fixture'

type Route = () => Response

const FUNCTION_ROUTE = 'functions/v1/delete-account'
const GOOGLE_SUBJECT = '108234567890'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
  })
}

type Account = { providers: string[]; email?: string; identities?: object[] }

const PASSWORD_ACCOUNT: Account = {
  providers: ['email'],
  email: 'sophie@exemple.fr',
  identities: [{ id: USER_ID, provider: 'email' }],
}

const GOOGLE_ACCOUNT: Account = {
  providers: ['google'],
  email: 'sophie@gmail.com',
  identities: [
    {
      id: GOOGLE_SUBJECT,
      provider: 'google',
      identity_data: { sub: GOOGLE_SUBJECT, email: 'sophie@gmail.com' },
    },
  ],
}

function sessionBody(userId = USER_ID, account: Account = PASSWORD_ACCOUNT) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  return {
    access_token: `access-${userId}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: `refresh-${userId}`,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: account.email,
      app_metadata: { provider: account.providers[0], providers: account.providers },
      user_metadata: {},
      identities: account.identities,
      created_at: '2026-03-03T10:00:00Z',
    },
  }
}

function fakeServer() {
  const routes = new Map<string, Route>()
  const requests: Array<{ route: string; method: string; authorization: string | null }> = []
  const bodies: unknown[] = []
  let offline = false

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const endpoint = url.pathname.replace('/auth/v1/', '').replace(/^\//, '')
    const grantType = url.searchParams.get('grant_type')
    const route = grantType ? `${endpoint}:${grantType}` : endpoint
    const headers = new Headers(init?.headers)
    requests.push({
      route,
      method: init?.method ?? 'GET',
      authorization: headers.get('Authorization'),
    })
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body))
    if (offline) throw new TypeError('Failed to fetch')
    return routes.get(route)?.() ?? new Response(null, { status: 204 })
  }

  return {
    fetch: fakeFetch as typeof fetch,
    requests,
    bodies,
    routes: () => requests.map((request) => request.route),
    on: (route: string, reply: Route) => void routes.set(route, reply),
    goOffline: () => {
      offline = true
    },
  }
}

let storage: MemoryStorage
let server: ReturnType<typeof fakeServer>
let repository: AccountDeletionRepository

function storeSession(body: ReturnType<typeof sessionBody>): void {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(body))
}

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  server = fakeServer()
  const supabase = createClient('https://memopatte-test.supabase.co', 'sb_publishable_test', {
    global: { fetch: server.fetch },
    auth: { storage, storageKey: AUTH_STORAGE_KEY, autoRefreshToken: false },
  })
  repository = createAccountDeletionRepository({
    loadClient: vi.fn<() => Promise<SupabaseClient>>(async () => supabase),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function failureOf(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => null,
    (cause: unknown) => cause,
  )
}

async function accountReasonOf(operation: Promise<unknown>): Promise<string> {
  const error = await failureOf(operation)
  expect(error).toBeInstanceOf(AccountError)
  return (error as AccountError).reason
}

async function deletionReasonOf(operation: Promise<unknown>): Promise<string> {
  const error = await failureOf(operation)
  expect(error).toBeInstanceOf(AccountDeletionError)
  return (error as AccountDeletionError).reason
}

describe('createAccountDeletionRepository', () => {
  describe('confirmationMethod', () => {
    it('demande le mot de passe pour un compte qui en a un', async () => {
      storeSession(sessionBody())

      await expect(repository.confirmationMethod()).resolves.toEqual({ kind: 'password' })
    })

    it('demande le mot de passe dès que le compte en a un, même ouvert avec Google', async () => {
      storeSession(
        sessionBody(USER_ID, {
          ...GOOGLE_ACCOUNT,
          providers: ['google', 'email'],
        }),
      )

      await expect(repository.confirmationMethod()).resolves.toEqual({ kind: 'password' })
    })

    it('demande Google, avec son adresse, pour un compte créé avec Google', async () => {
      storeSession(sessionBody(USER_ID, GOOGLE_ACCOUNT))

      await expect(repository.confirmationMethod()).resolves.toEqual({
        kind: 'google',
        email: 'sophie@gmail.com',
        subject: GOOGLE_SUBJECT,
      })
    })

    it('lit l’appareil, sans appel réseau', async () => {
      storeSession(sessionBody())

      await repository.confirmationMethod()

      expect(server.requests).toEqual([])
    })

    it('lève « autre » sans session sur l’appareil', async () => {
      expect(await accountReasonOf(repository.confirmationMethod())).toBe('unknown')
    })
  })

  describe('confirmPassword', () => {
    it('ouvre une nouvelle session avec l’adresse du compte et le mot de passe saisi', async () => {
      storeSession(sessionBody())
      server.on('token:password', () => json(200, sessionBody()))

      await repository.confirmPassword('secret-123')

      expect(server.bodies.at(-1)).toMatchObject({
        email: 'sophie@exemple.fr',
        password: 'secret-123',
      })
    })

    it('signale un mot de passe faux', async () => {
      storeSession(sessionBody())
      server.on('token:password', () =>
        json(400, { code: 'invalid_credentials', msg: 'invalid_credentials' }),
      )

      expect(await accountReasonOf(repository.confirmPassword('faux'))).toBe('invalid-credentials')
    })

    it('signale l’absence de réseau', async () => {
      storeSession(sessionBody())
      server.goOffline()

      expect(await accountReasonOf(repository.confirmPassword('secret-123'))).toBe('offline')
    })

    it('lève « autre » sans adresse de compte, sans rien envoyer', async () => {
      expect(await accountReasonOf(repository.confirmPassword('secret-123'))).toBe('unknown')
      expect(server.requests).toEqual([])
    })
  })

  describe('confirmWithGoogleIdToken', () => {
    it('ouvre une nouvelle session avec le jeton Google et le nonce en clair', async () => {
      storeSession(sessionBody(USER_ID, GOOGLE_ACCOUNT))
      server.on('token:id_token', () => json(200, sessionBody(USER_ID, GOOGLE_ACCOUNT)))

      await repository.confirmWithGoogleIdToken('jeton-google', 'nonce-en-clair')

      expect(server.bodies.at(-1)).toMatchObject({
        provider: 'google',
        id_token: 'jeton-google',
        nonce: 'nonce-en-clair',
      })
    })

    it('signale l’absence de réseau', async () => {
      server.goOffline()

      expect(await accountReasonOf(repository.confirmWithGoogleIdToken('jeton', 'nonce'))).toBe(
        'offline',
      )
    })
  })

  describe('deleteAccount', () => {
    it('appelle la fonction de suppression avec le jeton de la session', async () => {
      storeSession(sessionBody())
      server.on(FUNCTION_ROUTE, () => json(200, { status: 'deleted' }))

      await repository.deleteAccount()

      expect(server.requests).toEqual([
        { route: FUNCTION_ROUTE, method: 'POST', authorization: `Bearer access-${USER_ID}` },
      ])
    })

    it('demande de confirmer de nouveau son identité quand le serveur la juge trop ancienne (401)', async () => {
      storeSession(sessionBody())
      server.on(FUNCTION_ROUTE, () => json(401, { error: 'unauthorized' }))

      expect(await deletionReasonOf(repository.deleteAccount())).toBe('identity-expired')
    })

    it('signale un échec quand le serveur refuse le compte (403)', async () => {
      storeSession(sessionBody())
      server.on(FUNCTION_ROUTE, () => json(403, { error: 'forbidden' }))

      expect(await deletionReasonOf(repository.deleteAccount())).toBe('failed')
    })

    it('signale un échec quand la suppression n’aboutit pas côté serveur', async () => {
      storeSession(sessionBody())
      server.on(FUNCTION_ROUTE, () => json(500, { error: 'deletion-failed' }))

      expect(await deletionReasonOf(repository.deleteAccount())).toBe('failed')
    })

    it('signale un échec sans réseau', async () => {
      storeSession(sessionBody())
      server.goOffline()

      expect(await deletionReasonOf(repository.deleteAccount())).toBe('failed')
    })

    it('signale un échec quand le client ne se charge pas', async () => {
      const failing = createAccountDeletionRepository({
        loadClient: async () => {
          throw new Error('configuration absente')
        },
      })

      expect(await deletionReasonOf(failing.deleteAccount())).toBe('failed')
    })

    it('ne désigne le compte que par le jeton de sa session, sans identifiant envoyé', async () => {
      storeSession(sessionBody(OTHER_USER_ID))
      server.on(FUNCTION_ROUTE, () => json(200, { status: 'deleted' }))

      await repository.deleteAccount()

      expect(server.requests[0]?.authorization).toBe(`Bearer access-${OTHER_USER_ID}`)
      expect(server.bodies).toEqual([])
    })
  })
})
