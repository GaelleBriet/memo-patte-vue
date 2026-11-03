// @vitest-environment node
import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { SUPABASE_REQUEST_TIMEOUT_MS, SupabaseRequestTimeoutError } from '../request-timeout'
import { NoUserSessionError } from '../user-session-required'

const createClient = vi.hoisted(() =>
  vi.fn<(url: string, key: string, options: SupabaseClientOptions<'public'>) => object>(() => ({})),
)
vi.mock('@supabase/supabase-js', () => ({ createClient }))

let appFetch: typeof fetch | undefined

async function clientFetch(): Promise<typeof fetch> {
  await import('../client')
  appFetch ??= createClient.mock.calls[0]![2].global!.fetch!
  return appFetch
}

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
  const outcome = (await clientFetch())('https://projet.supabase.co/rest/v1/sync_push', {
    method: 'POST',
    headers: { apikey: 'sb_publishable_test', Authorization: 'Bearer jeton-utilisateur' },
  }).catch((cause: unknown) => cause)
  await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS)

  expect(await outcome).toBeInstanceOf(SupabaseRequestTimeoutError)
})

it('le client de l’app ne lit aucune ligne avec la clé publique pour seul jeton', async () => {
  const outcome = (await clientFetch())('https://projet.supabase.co/rest/v1/animals', {
    headers: { apikey: 'sb_publishable_test', Authorization: 'Bearer sb_publishable_test' },
  })

  await expect(outcome).rejects.toBeInstanceOf(NoUserSessionError)
  expect(fetch).not.toHaveBeenCalled()
})
