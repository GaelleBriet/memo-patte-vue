// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { isTransportFailure } from '../transport-failure'

async function errorFrom(serverFetch: typeof fetch): Promise<unknown> {
  const supabase = createClient('https://projet.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: serverFetch },
  })
  const { error } = await supabase.from('sync_push').insert({ id: 'envoi-1' })
  return error
}

describe('isTransportFailure', () => {
  it('reconnaît une requête qui n’a pas reçu de réponse', async () => {
    const offline = await errorFrom(async () => {
      throw new TypeError('Failed to fetch')
    })

    expect(isTransportFailure(offline)).toBe(true)
  })

  it('ne prend pas un refus du serveur pour une panne de transport', async () => {
    const refused = await errorFrom(
      async () =>
        new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), {
          status: 403,
        }),
    )

    expect(isTransportFailure(refused)).toBe(false)
  })

  it('ne prend pas une erreur locale sans code pour une panne de transport', () => {
    expect(isTransportFailure(new Error('base locale verrouillée'))).toBe(false)
    expect(isTransportFailure(null)).toBe(false)
  })
})
