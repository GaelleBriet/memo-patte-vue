import { googleCredentials, type GoogleCredentials } from '@/core/google-sign-in/google-credentials'

import { createIdTokenNonce, type IdTokenNonce } from '../logic/id-token-nonce'
import { idTokenSubject } from '../logic/id-token-subject'
import {
  accountDeletionRepository,
  type AccountDeletionRepository,
  type IdentityConfirmationMethod,
} from '../repository/account-deletion.repository'

export type GoogleIdentity = Extract<IdentityConfirmationMethod, { kind: 'google' }>

export type GoogleIdentityConfirmation =
  | { kind: 'confirmed' }
  | { kind: 'cancelled' }
  | { kind: 'other-google-account'; expectedEmail: string }

export type AccountDeletionDependencies = {
  /** Efface la session et l'état du compte, comme la déconnexion, sans toucher au carnet. */
  forgetAccountOnDevice: () => Promise<void>
  repository?: AccountDeletionRepository
  credentials?: GoogleCredentials
  createNonce?: () => Promise<IdTokenNonce>
}

export function createAccountDeletionService({
  forgetAccountOnDevice,
  repository = accountDeletionRepository,
  credentials = googleCredentials,
  createNonce = createIdTokenNonce,
}: AccountDeletionDependencies) {
  return {
    confirmationMethod: (): Promise<IdentityConfirmationMethod> => repository.confirmationMethod(),

    /** Lève `AccountError`. */
    confirmWithPassword: (password: string): Promise<void> => repository.confirmPassword(password),

    /** Un autre compte Google est refusé avant d'ouvrir sa session. Lève `GoogleCredentialError` ou `AccountError`. */
    async confirmWithGoogle(expected: GoogleIdentity): Promise<GoogleIdentityConfirmation> {
      const nonce = await createNonce()
      const credential = await credentials.request(nonce.hashed)
      if (credential.kind === 'cancelled') return credential
      if (idTokenSubject(credential.idToken) !== expected.subject) {
        return { kind: 'other-google-account', expectedEmail: expected.email }
      }
      await repository.confirmWithGoogleIdToken(credential.idToken, nonce.raw)
      return { kind: 'confirmed' }
    },

    /** Lève `AccountDeletionError` ; l'appareil n'oublie le compte qu'une fois supprimé. */
    async deleteAccount(): Promise<void> {
      await repository.deleteAccount()
      await forgetAccountOnDevice()
    },
  }
}

export type AccountDeletionService = ReturnType<typeof createAccountDeletionService>
