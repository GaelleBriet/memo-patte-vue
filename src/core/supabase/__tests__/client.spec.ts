// @vitest-environment node
import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { SUPABASE_REQUEST_TIMEOUT_MS, SupabaseRequestTimeoutError } from '../request-timeout'

const createClient = vi.hoisted(() =>
  vi.fn<(url: string, key: string, options: SupabaseClientOptions<'public'>) => object>(() => ({})),
)
vi.mock('@supabase/supabase-js', () => ({ createClient }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://projet.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('le client de l’app borne ses requêtes de lignes', async () => {
  await import('../client')
  const clientFetch = createClient.mock.calls[0]![2].global!.fetch!

  const outcome = clientFetch('https://projet.supabase.co/rest/v1/sync_push', {
    method: 'POST',
  }).catch((cause: unknown) => cause)
  await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS)

  expect(await outcome).toBeInstanceOf(SupabaseRequestTimeoutError)
})
