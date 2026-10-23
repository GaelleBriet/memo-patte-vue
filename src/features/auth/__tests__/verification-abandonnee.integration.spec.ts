// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { AUTH_STORAGE_KEY } from '@/core/supabase/auth-storage'

import { useEmailCode } from '../composables/use-email-code'
import { usePasswordReset } from '../composables/use-password-reset'
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

function sessionBody(userId: string, email: string) {
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
let verified: unknown
let gate: Promise<void>
let release: () => void

function fakeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const route = url.pathname.replace('/auth/v1/', '')
    calls.push(`${init?.method ?? 'GET'} ${route}${url.search}`)
    if (route === 'verify') {
      await gate
      return json(200, verified)
    }
    return json(200, {})
  }) as typeof fetch
}

function launchApp() {
  const supabase: SupabaseClient = createClient('https://memopatte-test.supabase.co', 'sb_test', {
    global: { fetch: fakeFetch() },
    auth: { storage, storageKey: AUTH_STORAGE_KEY, autoRefreshToken: false },
  })
  provideAuthRepository(() => createAuthRepository({ loadClient: async () => supabase }))
  setActivePinia(createPinia())
  return useAuthStore()
}

function storedUserId(): string | null {
  const raw = storage.getItem(AUTH_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { user: { id: string } }).user.id : null
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function resetAbandonne(email: string) {
  const reset = effectScope().run(() => usePasswordReset({ email }))!
  await reset.sendCode()
  reset.emailCode.setCode('12345678')
  reset.newPassword.value = { password: 'nouveau-secret-1', confirmation: 'nouveau-secret-1' }
  const attente = reset.reset()
  await tick()
  reset.backToAddress()
  release()
  expect(await attente).toBe(false)
  await tick()
  await tick()
}

beforeEach(() => {
  storage = memoryStorage()
  calls = []
  gate = new Promise((resolve) => (release = resolve))
  vi.stubGlobal('localStorage', storage)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  provideAuthRepository(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('retour pendant la vérification d’un code', () => {
  it('« Mot de passe oublié » : la session de récupération ouverte par le serveur est jetée sur ce téléphone', async () => {
    verified = sessionBody(OTHER_USER_ID, 'milo@exemple.fr')
    launchApp()

    await resetAbandonne('milo@exemple.fr')

    expect(storedUserId()).toBeNull()
    expect(calls.some((call) => call.includes('scope=global'))).toBe(false)
  })

  it('« Mot de passe oublié » : la session du compte déjà présent sur le téléphone est gardée', async () => {
    writePlusAccount({ userId: USER_ID })
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionBody(USER_ID, 'sophie@exemple.fr')))
    verified = sessionBody(USER_ID, 'sophie@exemple.fr')
    const auth = launchApp()
    await auth.restore()

    await resetAbandonne('sophie@exemple.fr')

    expect(storedUserId()).toBe(USER_ID)
    expect(auth.sessionState).toBe('active')
  })

  it('inscription : une réussite tardive vaut réussite, le compte est ouvert', async () => {
    verified = sessionBody(USER_ID, 'sophie@exemple.fr')
    const auth = launchApp()
    const step = useEmailCode()
    step.afterSignUp('sophie@exemple.fr')
    step.setCode('12345678')

    const attente = step.confirm()
    await tick()
    step.close()
    release()

    expect(await attente).toBe(true)
    expect(storedUserId()).toBe(USER_ID)
    expect(auth.hasPlusAccount).toBe(true)
    expect(readPlusAccount()).toEqual({ userId: USER_ID })
  })
})
