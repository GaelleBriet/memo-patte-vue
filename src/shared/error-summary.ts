const LOGGED_FIELDS = ['name', 'reason', 'code', 'status'] as const

/** supabase-js attache le corps de la réponse à ses erreurs : `adb logcat` n'a pas à le lire. */
export function errorSummary(cause: unknown): string {
  if (typeof cause !== 'object' || cause === null) return typeof cause
  const fields = cause as Record<string, unknown>
  const parts = LOGGED_FIELDS.map((field) => fields[field]).filter(
    (value) => typeof value === 'string' || typeof value === 'number',
  )
  return parts.length > 0 ? parts.join(' ') : 'erreur sans nom'
}
