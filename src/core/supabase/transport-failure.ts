/** postgrest-js rend un code vide à toute requête restée sans réponse : délai dépassé, réseau coupé. */
export function isTransportFailure(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && (cause as { code?: unknown }).code === ''
}
