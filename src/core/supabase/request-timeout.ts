export const SUPABASE_REQUEST_TIMEOUT_MS = 30_000

/** Les photos ont leurs propres délais, plus longs : `storage-timeout.ts`. */
const BOUNDED_PATHS = ['/rest/v1/', '/auth/v1/']

/** Requête restée sans réponse : à réessayer au cycle suivant, comme une coupure du réseau. */
export class SupabaseRequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Requête Supabase sans réponse après ${timeoutMs / 1000} s.`)
    this.name = 'TimeoutError'
  }
}

export function createBoundedFetch(
  baseFetch: typeof fetch,
  timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS,
): typeof fetch {
  return (input, init) => {
    if (!isBounded(input)) return baseFetch(input, init)
    const controller = new AbortController()
    followCaller(init?.signal, controller)
    const silence = new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(new SupabaseRequestTimeoutError(timeoutMs))
        controller.abort()
      }, timeoutMs)
    })
    return Promise.race([baseFetch(input, { ...init, signal: controller.signal }), silence])
  }
}

function isBounded(input: RequestInfo | URL): boolean {
  const { pathname } = new URL(input instanceof Request ? input.url : input)
  return BOUNDED_PATHS.some((path) => pathname.startsWith(path))
}

function followCaller(signal: AbortSignal | null | undefined, controller: AbortController): void {
  if (!signal) return
  if (signal.aborted) controller.abort(signal.reason)
  else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
}
