// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBoundedFetch, SUPABASE_REQUEST_TIMEOUT_MS } from '../request-timeout'

const PROJECT = 'https://projet.supabase.co'

function clientOver(serverFetch: typeof fetch) {
  return createClient(PROJECT, 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createBoundedFetch(serverFetch) },
  })
}

function silentServer() {
  return vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('client Supabase borné, serveur muet', () => {
  it('une lecture rend son erreur au bout du délai, sans nouvelle tentative', async () => {
    const server = silentServer()
    const settled = vi.fn<(outcome: { error: unknown }) => void>()
    void clientOver(server).from('animal').select('id').then(settled)

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(settled).toHaveBeenCalledTimes(1)
    expect(settled.mock.calls[0]![0].error).toMatchObject({ code: '' })
    await vi.advanceTimersByTimeAsync(10 * SUPABASE_REQUEST_TIMEOUT_MS)
    expect(server).toHaveBeenCalledTimes(1)
  })
})
