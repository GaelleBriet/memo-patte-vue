// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  GoogleCredentialError,
  type GoogleCredential,
  type GoogleCredentials,
} from '@/core/google-sign-in/google-credentials'

import { AccountDeletionError } from '../logic/account-deletion-error'
import { AccountError } from '../logic/account-error'
import type { AccountDeletionRepository } from '../repository/account-deletion.repository'
import { createAccountDeletionService } from '../service/account-deletion.service'

const NONCE = { raw: 'nonce-en-clair', hashed: 'empreinte-du-nonce' }
const SOPHIE = { kind: 'google' as const, email: 'sophie@gmail.com', subject: '108234567890' }

function base64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

function idTokenOf(subject: string): string {
  return `${base64Url('{"alg":"RS256"}')}.${base64Url(JSON.stringify({ sub: subject }))}.signature`
}

function setup(credential: () => Promise<GoogleCredential> = async () => ({ kind: 'cancelled' })) {
  const steps: string[] = []
  const repository = {
    confirmationMethod: vi.fn<AccountDeletionRepository['confirmationMethod']>(async () => ({
      kind: 'password',
    })),
    confirmPassword: vi.fn<AccountDeletionRepository['confirmPassword']>(async () => {}),
    confirmWithGoogleIdToken: vi.fn<AccountDeletionRepository['confirmWithGoogleIdToken']>(
      async () => {},
    ),
    deleteAccount: vi.fn<AccountDeletionRepository['deleteAccount']>(async () => {
      steps.push('compte supprimé sur le serveur')
    }),
  }
  const credentials = {
    request: vi.fn<GoogleCredentials['request']>(credential),
    signOut: vi.fn<GoogleCredentials['signOut']>(async () => {}),
  }
  const forgetAccountOnDevice = vi.fn<() => Promise<void>>(async () => {
    steps.push('compte oublié sur l’appareil')
  })
  const service = createAccountDeletionService({
    repository,
    credentials,
    createNonce: async () => NONCE,
    forgetAccountOnDevice,
  })
  return { steps, repository, credentials, forgetAccountOnDevice, service }
}

describe('createAccountDeletionService', () => {
  it('dit comment confirmer l’identité du compte', async () => {
    const { repository, service } = setup()
    repository.confirmationMethod.mockResolvedValueOnce(SOPHIE)

    await expect(service.confirmationMethod()).resolves.toEqual(SOPHIE)
  })

  describe('confirmer avec le mot de passe', () => {
    it('vérifie le mot de passe saisi', async () => {
      const { repository, service } = setup()

      await service.confirmWithPassword('secret-123')

      expect(repository.confirmPassword).toHaveBeenCalledWith('secret-123')
    })

    it('laisse passer le refus d’un mot de passe faux', async () => {
      const { repository, service } = setup()
      repository.confirmPassword.mockRejectedValueOnce(new AccountError('invalid-credentials'))

      await expect(service.confirmWithPassword('faux')).rejects.toMatchObject({
        reason: 'invalid-credentials',
      })
    })
  })

  describe('confirmer avec Google', () => {
    it('reconnecte le compte Google du carnet avec le nonce', async () => {
      const { repository, credentials, service } = setup(async () => ({
        kind: 'granted',
        idToken: idTokenOf(SOPHIE.subject),
      }))

      await expect(service.confirmWithGoogle(SOPHIE)).resolves.toEqual({ kind: 'confirmed' })
      expect(credentials.request).toHaveBeenCalledWith(NONCE.hashed)
      expect(repository.confirmWithGoogleIdToken).toHaveBeenCalledWith(
        idTokenOf(SOPHIE.subject),
        NONCE.raw,
      )
    })

    it('refuse un autre compte Google sans changer de session', async () => {
      const { repository, service } = setup(async () => ({
        kind: 'granted',
        idToken: idTokenOf('marc-999'),
      }))

      await expect(service.confirmWithGoogle(SOPHIE)).resolves.toEqual({
        kind: 'other-google-account',
        expectedEmail: 'sophie@gmail.com',
      })
      expect(repository.confirmWithGoogleIdToken).not.toHaveBeenCalled()
    })

    it('refuse un jeton qui ne désigne aucun compte', async () => {
      const { repository, service } = setup(async () => ({ kind: 'granted', idToken: 'abc' }))

      await expect(service.confirmWithGoogle(SOPHIE)).resolves.toMatchObject({
        kind: 'other-google-account',
      })
      expect(repository.confirmWithGoogleIdToken).not.toHaveBeenCalled()
    })

    it('ne fait rien quand le sélecteur est fermé sans choisir', async () => {
      const { repository, service } = setup()

      await expect(service.confirmWithGoogle(SOPHIE)).resolves.toEqual({ kind: 'cancelled' })
      expect(repository.confirmWithGoogleIdToken).not.toHaveBeenCalled()
    })

    it('laisse passer une erreur du téléphone', async () => {
      const { service } = setup(async () => {
        throw new GoogleCredentialError('no-google-account')
      })

      await expect(service.confirmWithGoogle(SOPHIE)).rejects.toBeInstanceOf(GoogleCredentialError)
    })
  })

  describe('supprimer le compte', () => {
    it('oublie le compte sur l’appareil seulement après la suppression sur le serveur', async () => {
      const { steps, service } = setup()

      await service.deleteAccount()

      expect(steps).toEqual(['compte supprimé sur le serveur', 'compte oublié sur l’appareil'])
    })

    it('garde tout sur l’appareil quand la suppression n’aboutit pas', async () => {
      const { repository, forgetAccountOnDevice, service } = setup()
      repository.deleteAccount.mockRejectedValueOnce(new AccountDeletionError('failed'))

      await expect(service.deleteAccount()).rejects.toMatchObject({ reason: 'failed' })
      expect(forgetAccountOnDevice).not.toHaveBeenCalled()
    })

    it('reprend la suppression au nouvel essai', async () => {
      const { repository, forgetAccountOnDevice, service } = setup()
      repository.deleteAccount.mockRejectedValueOnce(new AccountDeletionError('failed'))
      await service.deleteAccount().catch(() => undefined)

      await service.deleteAccount()

      expect(repository.deleteAccount).toHaveBeenCalledTimes(2)
      expect(forgetAccountOnDevice).toHaveBeenCalledOnce()
    })
  })
})
