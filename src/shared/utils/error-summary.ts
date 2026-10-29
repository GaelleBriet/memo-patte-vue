const LOGGED_FIELDS = ['name', 'reason', 'code', 'status'] as const

/** postgrest-js préfixe du nom de l'erreur de `fetch` le message d'une requête restée sans réponse. */
const UNANSWERED_REQUESTS: Record<string, string> = {
  'AbortError:': 'délai dépassé',
  'TypeError:': 'coupure réseau',
}

/** supabase-js attache le corps de la réponse à ses erreurs : `adb logcat` n'a pas à le lire. */
export function errorSummary(cause: unknown): string {
  if (typeof cause !== 'object' || cause === null) return typeof cause
  const fields = cause as Record<string, unknown>
  const parts = LOGGED_FIELDS.map((field) => fields[field]).filter(
    (value) => typeof value === 'number' || (typeof value === 'string' && value !== ''),
  )
  if (parts.length > 0) return parts.join(' ')
  return unansweredRequest(fields.message) ?? 'erreur sans nom'
}

function unansweredRequest(message: unknown): string | undefined {
  if (typeof message !== 'string') return undefined
  const prefix = Object.keys(UNANSWERED_REQUESTS).find((name) => message.startsWith(name))
  return prefix && UNANSWERED_REQUESTS[prefix]
}

const MAX_LOCAL_MESSAGE = 200

/** Développement seulement, et jamais pour une erreur de Supabase (code, statut) : son message peut citer un e-mail. */
export function localErrorMessage(cause: unknown): string {
  if (!import.meta.env.DEV) return ''
  if (!(cause instanceof Error) || cause.name !== 'Error') return ''
  const { code, status } = cause as { code?: unknown; status?: unknown }
  if (code !== undefined || status !== undefined) return ''
  return cause.message.slice(0, MAX_LOCAL_MESSAGE)
}
