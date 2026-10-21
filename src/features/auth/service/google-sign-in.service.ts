import { googleCredentials, type GoogleCredentials } from '@/core/google-sign-in/google-credentials'

import { createIdTokenNonce, type IdTokenNonce } from '../logic/id-token-nonce'
import type { AuthRepository, AuthSession } from '../repository/auth.repository'

export type GoogleSignInOutcome =
  { kind: 'signed-in'; session: AuthSession } | { kind: 'cancelled' }

export type GoogleSignInDependencies = {
  credentials?: GoogleCredentials
  createNonce?: () => Promise<IdTokenNonce>
}

/** Lève `GoogleCredentialError` (téléphone) ou `AccountError` (Supabase). */
export async function signInWithGoogle(
  repository: Pick<AuthRepository, 'signInWithGoogleIdToken'>,
  {
    credentials = googleCredentials,
    createNonce = createIdTokenNonce,
  }: GoogleSignInDependencies = {},
): Promise<GoogleSignInOutcome> {
  const nonce = await createNonce()
  const credential = await credentials.request(nonce.hashed)
  if (credential.kind === 'cancelled') return credential
  const session = await repository.signInWithGoogleIdToken(credential.idToken, nonce.raw)
  return { kind: 'signed-in', session }
}
