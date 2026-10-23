const IDENTITY_MAX_AGE_SECONDS = 10 * 60
const CLOCK_SKEW_SECONDS = 60

function claimsOf(token: string): unknown {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

/** `amr` garde l'heure de la saisie du mot de passe ; `iat` change à chaque rafraîchissement. */
function lastConfirmedAt(token: string): number | null {
  const claims = claimsOf(token)
  if (typeof claims !== 'object' || claims === null) return null
  const { amr } = claims as { amr?: unknown }
  if (!Array.isArray(amr)) return null
  const times = amr
    .map((entry: unknown) => (entry as { timestamp?: unknown } | null)?.timestamp)
    .filter((time): time is number => typeof time === 'number' && Number.isFinite(time))
  return times.length > 0 ? Math.max(...times) : null
}

/** Le jeton doit avoir été vérifié par Supabase avant : ses claims ne sont pas contrôlés ici. */
export function isIdentityFresh(token: string, nowMs: number): boolean {
  const confirmedAt = lastConfirmedAt(token)
  if (confirmedAt === null) return false
  const age = nowMs / 1000 - confirmedAt
  return age >= -CLOCK_SKEW_SECONDS && age <= IDENTITY_MAX_AGE_SECONDS
}
