// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_STORAGE_KEY } from '@/core/supabase/auth-storage'

import { readPlusAccount, writePlusAccount } from '../logic/plus-account-storage'
import { createAuthRepository } from '../repository/auth.repository'
import { provideAuthRepository, useAuthStore } from '../store/auth.store'
import { memoryStorage, OTHER_USER_ID, USER_ID, type MemoryStorage } from './auth-fixture'

vi.mock('@/core/analytics', () => ({
  identify: vi.fn<(distinctId: string) => void>(),
  reset: vi.fn<() => void>(),
}))

vi.mock('@/core/google-sign-in/google-credentials', () => ({
  googleCredentials: { signOut: vi.fn<() => Promise<void>>(async () => {}) },
}))

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
  })
}

function sessionBody(userId: string, email: string, expiresInSeconds: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
  return {
    access_token: `access-${userId}-${expiresAt}`,
    token_type: 'bearer',
    expires_in: expiresInSeconds,
    expires_at: expiresAt,
    refresh_token: `refresh-${userId}`,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [{ id: userId, provider: 'email' }],
      created_at: '2026-03-03T10:00:00Z',
    },
  }
}

let storage: MemoryStorage
let calls: string[]
let verified: ReturnType<typeof sessionBody>

function fakeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const route = url.pathname.replace('/auth/v1/', '')
    const grant = url.searchParams.get('grant_type')
    calls.push(grant ? `${route}:${grant}` : route)
    if (route === 'verify') return json(200, verified)
    if (route === 'token' && grant === 'refresh_token') {
      return json(400, { code: 'refresh_token_not_found', msg: 'refresh_token_not_found' })
    }
    return new Response(null, { status: 204 })
  }) as typeof fetch
}

function launchApp() {
  const supabase: SupabaseClient = createClient(
    'https://memopatte-test.supabase.co',
    'sb_publishable_test',
    {
      global: { fetch: fakeFetch() },
      auth: { storage, storageKey: AUTH_STORAGE_KEY, autoRefreshToken: false },
    },
  )
  provideAuthRepository(() => createAuthRepository({ loadClient: async () => supabase }))
  setActivePinia(createPinia())
  return useAuthStore()
}

function storedUserId(): string | null {
  const raw = storage.getItem(AUTH_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { user: { id: string } }).user.id : null
}

beforeEach(() => {
  storage = memoryStorage()
  calls = []
  verified = sessionBody(OTHER_USER_ID, 'milo@exemple.fr', 3600)
  vi.stubGlobal('localStorage', storage)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  writePlusAccount({ userId: USER_ID })
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionBody(USER_ID, 'sophie@exemple.fr', -60)))
})

afterEach(() => {
  provideAuthRepository(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('code de récupération accepté pour un autre compte, puis abandon', () => {
  it('ne fait jamais prendre la main au compte récupéré, ni tout de suite ni au lancement suivant', async () => {
    const auth = launchApp()
    await auth.restore()

    await auth.verifyPasswordResetCode('milo@exemple.fr', '123456')
    expect(auth.userId).toBe(USER_ID)

    await auth.abandonPasswordReset()
    expect(storedUserId()).toBeNull()

    const relaunched = launchApp()
    await relaunched.restore()
    expect(relaunched.userId).toBe(USER_ID)
    expect(relaunched.sessionState).toBe('needs-sign-in')
    expect(readPlusAccount()).toEqual({ userId: USER_ID })
  })

  it('même quand l’app est fermée sans abandon : le lancement suivant ignore et efface la session récupérée', async () => {
    const auth = launchApp()
    await auth.verifyPasswordResetCode('milo@exemple.fr', '123456')
    expect(storedUserId()).toBe(OTHER_USER_ID)

    const relaunched = launchApp()
    await relaunched.restore()

    expect(relaunched.userId).toBe(USER_ID)
    expect(relaunched.sessionState).toBe('needs-sign-in')
    expect(storedUserId()).toBeNull()
  })
})

describe('code de récupération accepté pour le compte de l’appareil, puis abandon', () => {
  it('garde sa session : c’est celle du compte de l’appareil', async () => {
    verified = sessionBody(USER_ID, 'sophie@exemple.fr', 3600)
    const auth = launchApp()

    await auth.verifyPasswordResetCode('sophie@exemple.fr', '123456')
    await auth.abandonPasswordReset()

    expect(storedUserId()).toBe(USER_ID)
    expect(calls).not.toContain('logout')
  })
})
