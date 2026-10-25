const SECRET_KEYS = 'SUPABASE_SECRET_KEYS'
const KEY_NAME = 'default'

export type ServerSecretKey = { key: string } | { problem: string }

type Handler = (request: Request) => Promise<Response>

function namedKeyIn(raw: string | undefined): unknown {
  if (!raw) return undefined
  try {
    const keys: unknown = JSON.parse(raw)
    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) return undefined
    return (keys as Record<string, unknown>)[KEY_NAME]
  } catch {
    return undefined
  }
}

/** Les messages ne citent jamais la valeur lue : ils finissent dans les journaux de la fonction. */
export function serverSecretKeyFrom(env: (name: string) => string | undefined): ServerSecretKey {
  const value = namedKeyIn(env(SECRET_KEYS))
  if (typeof value !== 'string') {
    return { problem: `${SECRET_KEYS} n’a pas de clé secrète « ${KEY_NAME} » lisible` }
  }
  if (value.startsWith('eyJ')) {
    return {
      problem: `la clé « ${KEY_NAME} » de ${SECRET_KEYS} a l’ancienne forme (JWT), attendu sb_secret_…`,
    }
  }
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(value)) {
    return { problem: `la clé « ${KEY_NAME} » de ${SECRET_KEYS} n’a pas la forme sb_secret_…` }
  }
  return { key: value }
}

export function withServerSecretKey(
  name: string,
  reading: ServerSecretKey,
  handlerFor: (key: string) => Handler,
  headers: Record<string, string> = {},
): Handler {
  if ('key' in reading) return handlerFor(reading.key)
  return async () => {
    console.error(`${name} refusée : ${reading.problem}`)
    return new Response(JSON.stringify({ error: 'server-key-not-configured' }), {
      status: 503,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
}
