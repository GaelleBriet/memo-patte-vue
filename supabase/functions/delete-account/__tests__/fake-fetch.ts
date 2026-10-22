export type SentRequest = {
  url: string
  method: string
  headers: Headers
  body: string | null
  signal: AbortSignal | null
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Un `fetch` qui note chaque requête et ne sort jamais sur le réseau. */
export function fakeFetch(respond: (request: SentRequest) => Response) {
  const requests: SentRequest[] = []

  const send: typeof fetch = async (input, init) => {
    const request: SentRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
      signal: init?.signal ?? null,
    }
    requests.push(request)
    return respond(request)
  }

  return { fetch: send, requests }
}
