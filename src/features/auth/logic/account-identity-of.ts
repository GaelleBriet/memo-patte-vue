/** `password` dès que le compte a un mot de passe, même ouvert avec Google ce jour-là. */
export type AccountIdentity =
  { kind: 'password'; email: string } | { kind: 'google'; email: string; subject: string }

type SupabaseUserShape = {
  email?: string
  app_metadata: { provider?: string; providers?: string[] }
  identities?: Array<{
    provider: string
    id: string
    identity_data?: Record<string, unknown>
  }>
}

export function accountIdentityOf(user: SupabaseUserShape): AccountIdentity {
  const providers = user.app_metadata.providers ?? [user.app_metadata.provider]
  const google = user.identities?.find((identity) => identity.provider === 'google')
  if (providers.includes('email') || !google) return { kind: 'password', email: user.email ?? '' }
  const data = google.identity_data ?? {}
  return {
    kind: 'google',
    email: typeof data.email === 'string' ? data.email : (user.email ?? ''),
    subject: typeof data.sub === 'string' ? data.sub : google.id,
  }
}
