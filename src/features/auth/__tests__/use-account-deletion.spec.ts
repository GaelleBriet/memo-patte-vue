// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { GoogleCredentialError } from '@/core/google-sign-in/google-credentials'

import { useAccountDeletion } from '../composables/use-account-deletion'
import { AccountDeletionError } from '../logic/account-deletion-error'
import { AccountError } from '../logic/account-error'
import type { AccountDeletionService } from '../service/account-deletion.service'

const SOPHIE_GOOGLE = { kind: 'google' as const, email: 'sophie@gmail.com', subject: '1082' }

function setup() {
  const service = {
    confirmationMethod: vi.fn<AccountDeletionService['confirmationMethod']>(async () => ({
      kind: 'password',
    })),
    confirmWithPassword: vi.fn<AccountDeletionService['confirmWithPassword']>(async () => {}),
    confirmWithGoogle: vi.fn<AccountDeletionService['confirmWithGoogle']>(async () => ({
      kind: 'confirmed',
    })),
    deleteAccount: vi.fn<AccountDeletionService['deleteAccount']>(async () => {}),
  }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  return { service, flow: useAccountDeletion(service) }
}

async function atFinalConfirmation() {
  const context = setup()
  await context.flow.proceed()
  await context.flow.confirmWithPassword('secret-123')
  return context
}

describe('useAccountDeletion', () => {
  it('commence par dire ce qui change (D1)', () => {
    expect(setup().flow.step.value).toBe('explain')
  })

  describe('confirmer son identité', () => {
    it('demande le mot de passe d’un compte qui en a un (D2)', async () => {
      const { flow } = setup()

      await flow.proceed()

      expect(flow.step.value).toBe('confirm-identity')
      expect(flow.method.value).toEqual({ kind: 'password' })
    })

    it('propose Google pour un compte créé avec Google (D2 bis)', async () => {
      const { service, flow } = setup()
      service.confirmationMethod.mockResolvedValueOnce(SOPHIE_GOOGLE)

      await flow.proceed()

      expect(flow.method.value).toEqual(SOPHIE_GOOGLE)
    })

    it('passe à la confirmation finale (D3) avec le bon mot de passe', async () => {
      const { service, flow } = await atFinalConfirmation()

      expect(service.confirmWithPassword).toHaveBeenCalledWith('secret-123')
      expect(flow.step.value).toBe('final-confirm')
      expect(flow.identityError.value).toBeNull()
    })

    it('reste sur D2 avec « Mot de passe incorrect » quand il est faux', async () => {
      const { service, flow } = setup()
      await flow.proceed()
      service.confirmWithPassword.mockRejectedValueOnce(new AccountError('invalid-credentials'))

      await flow.confirmWithPassword('faux')

      expect(flow.step.value).toBe('confirm-identity')
      expect(flow.identityError.value).toEqual({
        key: 'settings.account.delete.identity.wrongPassword',
      })
    })

    it('donne le message de la connexion sans réseau', async () => {
      const { service, flow } = setup()
      await flow.proceed()
      service.confirmWithPassword.mockRejectedValueOnce(new AccountError('offline'))

      await flow.confirmWithPassword('secret-123')

      expect(flow.identityError.value).toEqual({ key: 'auth.errors.offline' })
    })

    it('n’envoie pas un mot de passe vide', async () => {
      const { service, flow } = setup()
      await flow.proceed()

      await flow.confirmWithPassword('')

      expect(service.confirmWithPassword).not.toHaveBeenCalled()
      expect(flow.step.value).toBe('confirm-identity')
    })

    it('passe à la confirmation finale avec le compte Google du carnet', async () => {
      const { service, flow } = setup()
      service.confirmationMethod.mockResolvedValueOnce(SOPHIE_GOOGLE)
      await flow.proceed()

      await flow.confirmWithGoogle()

      expect(service.confirmWithGoogle).toHaveBeenCalledWith(SOPHIE_GOOGLE)
      expect(flow.step.value).toBe('final-confirm')
    })

    it('refuse un autre compte Google et reste sur D2 bis', async () => {
      const { service, flow } = setup()
      service.confirmationMethod.mockResolvedValueOnce(SOPHIE_GOOGLE)
      service.confirmWithGoogle.mockResolvedValueOnce({
        kind: 'other-google-account',
        expectedEmail: 'sophie@gmail.com',
      })
      await flow.proceed()

      await flow.confirmWithGoogle()

      expect(flow.step.value).toBe('confirm-identity')
      expect(flow.identityError.value).toEqual({
        key: 'settings.account.delete.identity.otherGoogleAccount',
        params: { email: 'sophie@gmail.com' },
      })
    })

    it('ne fait rien quand le sélecteur Google est fermé sans choisir', async () => {
      const { service, flow } = setup()
      service.confirmationMethod.mockResolvedValueOnce(SOPHIE_GOOGLE)
      service.confirmWithGoogle.mockResolvedValueOnce({ kind: 'cancelled' })
      await flow.proceed()

      await flow.confirmWithGoogle()

      expect(flow.step.value).toBe('confirm-identity')
      expect(flow.identityError.value).toBeNull()
    })

    it('donne le message de la connexion quand Google n’a aucun compte sur le téléphone', async () => {
      const { service, flow } = setup()
      service.confirmationMethod.mockResolvedValueOnce(SOPHIE_GOOGLE)
      service.confirmWithGoogle.mockRejectedValueOnce(
        new GoogleCredentialError('no-google-account'),
      )
      await flow.proceed()

      await flow.confirmWithGoogle()

      expect(flow.identityError.value).toEqual({ key: 'auth.errors.noGoogleAccount' })
    })

    it('montre l’échec (D6) quand la façon de confirmer est illisible, puis la relit', async () => {
      const { service, flow } = setup()
      service.confirmationMethod.mockRejectedValueOnce(new AccountError('unknown'))

      await flow.proceed()
      expect(flow.step.value).toBe('failed')

      await flow.retry()
      expect(flow.step.value).toBe('confirm-identity')
    })
  })

  describe('supprimer', () => {
    it('Annuler sur D3 revient à ce qui change (D1)', async () => {
      const { flow } = await atFinalConfirmation()

      flow.cancelFinalConfirmation()

      expect(flow.step.value).toBe('explain')
    })

    it('supprime (D4), puis montre « Compte supprimé » (D5)', async () => {
      const { service, flow } = await atFinalConfirmation()
      let resolve: () => void = () => {}
      service.deleteAccount.mockImplementationOnce(
        () => new Promise<void>((done) => (resolve = done)),
      )

      const deleting = flow.deleteAccount()
      expect(flow.step.value).toBe('deleting')
      resolve()
      await deleting

      expect(flow.step.value).toBe('deleted')
    })

    it('montre l’échec (D6) quand la suppression n’aboutit pas', async () => {
      const { service, flow } = await atFinalConfirmation()
      service.deleteAccount.mockRejectedValueOnce(new AccountDeletionError('failed'))

      await flow.deleteAccount()

      expect(flow.step.value).toBe('failed')
    })

    it('Réessayer reprend la suppression', async () => {
      const { service, flow } = await atFinalConfirmation()
      service.deleteAccount.mockRejectedValueOnce(new AccountDeletionError('failed'))
      await flow.deleteAccount()

      await flow.retry()

      expect(service.deleteAccount).toHaveBeenCalledTimes(2)
      expect(flow.step.value).toBe('deleted')
    })

    it('Réessayer redemande l’identité quand le serveur la juge trop ancienne', async () => {
      const { service, flow } = await atFinalConfirmation()
      service.deleteAccount.mockRejectedValueOnce(new AccountDeletionError('identity-expired'))
      await flow.deleteAccount()
      expect(flow.step.value).toBe('failed')

      await flow.retry()

      expect(flow.step.value).toBe('confirm-identity')
      expect(service.deleteAccount).toHaveBeenCalledOnce()
    })

    it('ne lance pas deux suppressions à la fois', async () => {
      const { service, flow } = await atFinalConfirmation()

      await Promise.all([flow.deleteAccount(), flow.deleteAccount()])

      expect(service.deleteAccount).toHaveBeenCalledOnce()
    })
  })

  describe('revenir en arrière', () => {
    it('de D2 revient à D1, sans quitter, et oublie l’erreur', async () => {
      const { service, flow } = setup()
      await flow.proceed()
      service.confirmWithPassword.mockRejectedValueOnce(new AccountError('invalid-credentials'))
      await flow.confirmWithPassword('faux')

      expect(flow.back()).toBe(true)

      expect(flow.step.value).toBe('explain')
      expect(flow.identityError.value).toBeNull()
    })

    it('de D1 quitte le parcours', () => {
      expect(setup().flow.back()).toBe(false)
    })
  })
})
