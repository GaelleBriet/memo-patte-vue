/** Le jeton n'est pas vérifié ici : Supabase le vérifie, ceci ne sert qu'à refuser un autre compte. */
export function idTokenSubject(idToken: string): string | null {
  const payload = idToken.split('.')[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof claims !== 'object' || claims === null) return null
    const { sub } = claims as { sub?: unknown }
    return typeof sub === 'string' ? sub : null
  } catch {
    return null
  }
}
