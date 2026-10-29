// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createBoundedFetch,
  SUPABASE_REQUEST_TIMEOUT_MS,
  SupabaseRequestTimeoutError,
} from '../request-timeout'

const PROJECT = 'https://projet.supabase.co'

function silentFetch() {
  return vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createBoundedFetch', () => {
  it('une requête PostgREST sans réponse échoue au bout du délai maximal, pas avant', async () => {
    const bounded = createBoundedFetch(silentFetch())
    const outcome = bounded(`${PROJECT}/rest/v1/sync_push`, { method: 'POST' }).catch(
      (cause: unknown) => cause,
    )
    const settled = vi.fn<() => void>()
    void outcome.then(settled)

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(await outcome).toBeInstanceOf(SupabaseRequestTimeoutError)
  })

  it('annule la requête restée sans réponse', async () => {
    const base = silentFetch()
    const bounded = createBoundedFetch(base)
    void bounded(`${PROJECT}/rest/v1/animal`, { method: 'GET' }).catch(() => undefined)

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS)

    expect(base.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  })

  it('borne aussi les requêtes Auth', async () => {
    const bounded = createBoundedFetch(silentFetch())
    const outcome = bounded(`${PROJECT}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
    }).catch((cause: unknown) => cause)

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS)

    expect(await outcome).toBeInstanceOf(SupabaseRequestTimeoutError)
  })

  it('rend la réponse arrivée à temps', async () => {
    const answer = new Response('[]', { status: 200 })
    const bounded = createBoundedFetch(vi.fn<typeof fetch>(async () => answer))

    expect(await bounded(`${PROJECT}/rest/v1/animal`, { method: 'GET' })).toBe(answer)
  })

  it('laisse les photos à leurs propres délais', async () => {
    const base = silentFetch()
    const bounded = createBoundedFetch(base)
    const init = { method: 'POST' }
    const settled = vi.fn<() => void>()
    void bounded(`${PROJECT}/storage/v1/object/animal-photos/a.jpg`, init).then(settled, settled)

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS * 3)

    expect(settled).not.toHaveBeenCalled()
    expect(base).toHaveBeenCalledWith(`${PROJECT}/storage/v1/object/animal-photos/a.jpg`, init)
  })

  it('transmet une annulation demandée par l’appelant', async () => {
    const base = silentFetch()
    const bounded = createBoundedFetch(base)
    const caller = new AbortController()
    void bounded(`${PROJECT}/rest/v1/animal`, { signal: caller.signal }).catch(() => undefined)

    caller.abort()

    expect(base.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  })
})
