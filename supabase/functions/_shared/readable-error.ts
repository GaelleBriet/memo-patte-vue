const KNOWN_FIELDS = ['message', 'code', 'details', 'hint', 'status'] as const

/** Une erreur rendue lisible pour le journal ; d'un objet, seuls les champs connus sortent, jamais un en-tête, une clé ou un corps. */
export function readableError(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause !== 'object' || cause === null) return String(cause)
  const fields = KNOWN_FIELDS.flatMap((field) => {
    const value = (cause as Record<string, unknown>)[field]
    const printable = typeof value === 'string' ? value !== '' : typeof value === 'number'
    return printable ? [`${field}: ${value}`] : []
  })
  return fields.length > 0 ? fields.join(', ') : String(cause)
}
