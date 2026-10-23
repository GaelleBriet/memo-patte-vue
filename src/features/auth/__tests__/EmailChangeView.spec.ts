import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { CODE_LENGTH } from '../logic/email-code'
import { AccountError } from '../logic/account-error'
import { writePlusAccount } from '../logic/plus-account-storage'
import { authRepository } from '../repository/auth.repository'
import { provideAuthRepository } from '../store/auth.store'
import EmailChangeView from '../views/EmailChangeView.vue'
import PasswordField from '@/shared/form/PasswordField.vue'
import { memoryStorage, USER_ID } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { toastMessage } from '@/shared/utils/toast'

const code = (digit: string) => digit.repeat(CODE_LENGTH)
const NOUVELLE = 'sophie2@exemple.fr'
const ACTUELLE = 'sophie@exemple.fr'

let replace: MockInstance
let reauthenticate: MockInstance<typeof authRepository.reauthenticate>
let requestEmailChange: MockInstance<typeof authRepository.requestEmailChange>
let verifyEmailChangeCode: MockInstance<typeof authRepository.verifyEmailChangeCode>
let wrapper: VueWrapper | null = null

provideAuthRepository(() => authRepository)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 22, 18, 0) })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  writePlusAccount({ userId: USER_ID })
  await router.push({ name: 'settings-account-email' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
  vi.spyOn(authRepository, 'accountIdentity').mockResolvedValue({
    kind: 'password',
    email: 'sophie@exemple.fr',
  })
  reauthenticate = vi.spyOn(authRepository, 'reauthenticate').mockResolvedValue({ userId: USER_ID })
  requestEmailChange = vi.spyOn(authRepository, 'requestEmailChange').mockResolvedValue()
  verifyEmailChangeCode = vi
    .spyOn(authRepository, 'verifyEmailChangeCode')
    .mockResolvedValueOnce(null)
    .mockResolvedValue({ userId: USER_ID })
  vi.spyOn(authRepository, 'resendEmailChangeCode').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(EmailChangeView, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

async function toucher(w: VueWrapper, selecteur: string) {
  await w.get(selecteur).trigger('click')
  await flushPromises()
}

async function codeEnvoye() {
  const w = await monter()
  await w.get('#email-change-current').setValue('ancien-secret')
  await w.get('#email-change-email').setValue(NOUVELLE)
  await toucher(w, '.email-change__send')
  return w
}

async function secondEtape() {
  const w = await codeEnvoye()
  await w.get('#email-code-input').setValue(code('1'))
  await toucher(w, '.email-change__confirm')
  return w
}

function champsDeMotDePasse(w: VueWrapper): (string | undefined)[] {
  return w.findAllComponents(PasswordField).map((champ) => champ.get('input').attributes('id'))
}

describe('EmailChangeView', () => {
  describe('étape 1 (V24 quater)', () => {
    it('porte le champ partagé avec l’icône œil pour le mot de passe actuel', async () => {
      const w = await monter()

      expect(champsDeMotDePasse(w)).toEqual(['email-change-current'])
    })

    it('demande le mot de passe actuel, propose « Mot de passe oublié ? », puis la nouvelle adresse', async () => {
      const w = await monter()

      expect(w.get('h1').text()).toBe('Changer mon adresse e-mail')
      expect(w.get('label[for="email-change-current"]').text()).toContain('Mot de passe actuel')
      expect(w.get('.email-change__forgot').text()).toBe('Mot de passe oublié ?')
      expect(w.get('label[for="email-change-email"]').text()).toContain('Nouvelle adresse e-mail')
      expect(w.get('#email-change-email').attributes('type')).toBe('email')
      expect(w.text()).toContain(
        'Un code sera envoyé à ton adresse actuelle, puis un autre à la nouvelle.',
      )
      const send = w.get('.email-change__send')
      expect(send.text()).toBe('Recevoir le code')
      expect(send.attributes('aria-label')).toBe('Recevoir les codes')
    })

    it('dit « Mot de passe incorrect. Réessaie. » quand le mot de passe est faux', async () => {
      reauthenticate.mockRejectedValue(new AccountError('invalid-credentials'))
      const w = await codeEnvoye()

      expect(w.text()).toContain('Mot de passe incorrect. Réessaie.')
      expect(requestEmailChange).not.toHaveBeenCalled()
    })

    it('refuse une adresse déjà prise (V24 quinquies), avec le message de l’inscription', async () => {
      requestEmailChange.mockRejectedValue(new AccountError('email-taken'))
      const w = await codeEnvoye()

      expect(w.text()).toContain('Un compte existe déjà avec cette adresse e-mail.')
      expect(w.text()).not.toContain(
        'Un code sera envoyé à ton adresse actuelle, puis un autre à la nouvelle.',
      )
    })

    it('« Mot de passe oublié ? » remplace l’écran par V24 septies, adresse du compte verrouillée', async () => {
      const w = await monter()

      await toucher(w, '.email-change__forgot')

      expect(replace).toHaveBeenCalledWith({
        name: 'password-reset',
        query: { from: 'settings-account' },
        state: { email: 'sophie@exemple.fr', emailLocked: true },
      })
    })
  })

  describe('code de l’adresse actuelle (V24 quinquies, première fois)', () => {
    it('montre le code reçu à l’adresse actuelle, avec le lien vers Aide et contact', async () => {
      const w = await codeEnvoye()

      expect(requestEmailChange).toHaveBeenCalledWith(NOUVELLE)
      expect(w.get('.email-code__message').text()).toBe(
        'Code reçu à ton adresse actuelle, sophie@exemple.fr',
      )
      expect(w.find('.email-code__change').exists()).toBe(false)
      expect(w.get('.email-change__lost').text()).toBe('Tu n’as plus accès à cette adresse ?')
      expect(w.get('.email-change__confirm').attributes('disabled')).toBeDefined()
    })

    it('ouvre Aide et contact par le lien', async () => {
      const push = vi.spyOn(router, 'push').mockResolvedValue()
      const w = await codeEnvoye()

      await toucher(w, '.email-change__lost')

      expect(push).toHaveBeenCalledWith({ name: 'settings-help' })
    })

    it('refuse l’adresse du compte retapée, sous le champ, sans rien envoyer', async () => {
      const w = await monter()
      await w.get('#email-change-current').setValue('ancien-secret')
      await w.get('#email-change-email').setValue('Sophie@Exemple.fr')

      await toucher(w, '.email-change__send')

      expect(w.text()).toContain('C’est déjà l’adresse de ton compte.')
      expect(reauthenticate).not.toHaveBeenCalled()
      expect(requestEmailChange).not.toHaveBeenCalled()
    })
  })

  describe('code de la nouvelle adresse (V24 quinquies, seconde fois)', () => {
    it('passe au code de la nouvelle adresse sans changer le compte', async () => {
      const w = await secondEtape()

      expect(verifyEmailChangeCode).toHaveBeenCalledWith(ACTUELLE, code('1'))
      expect(w.get('.email-code__message').text()).toBe(
        'Code reçu à la nouvelle adresse, sophie2@exemple.fr',
      )
      expect(w.get('.email-code__label').text()).toBe('Code de confirmation')
      expect(w.get('#email-code-input').attributes('aria-label')).toBe(
        `Code à ${CODE_LENGTH} chiffres envoyé à la nouvelle adresse`,
      )
      expect(w.find('.email-change__lost').exists()).toBe(false)
      expect(toastMessage.value).not.toBe('Adresse e-mail modifiée.')
      expect(replace).not.toHaveBeenCalled()
    })

    it('confirme, dit « Adresse e-mail modifiée. » et revient à Compte', async () => {
      const w = await secondEtape()
      await w.get('#email-code-input').setValue(code('2'))

      await toucher(w, '.email-change__confirm')

      expect(verifyEmailChangeCode).toHaveBeenLastCalledWith(NOUVELLE, code('2'))
      expect(toastMessage.value).toBe('Adresse e-mail modifiée.')
      expect(replace).toHaveBeenCalledWith({ name: 'settings-account' })
    })

    it('dit « pas le bon » pour un code refusé', async () => {
      verifyEmailChangeCode.mockReset().mockRejectedValue(new AccountError('invalid-code'))
      const w = await codeEnvoye()
      await w.get('#email-code-input').setValue(code('0'))

      await toucher(w, '.email-change__confirm')

      expect(w.get('.email-code__error').text()).toBe(
        'Ce code n’est pas le bon. Vérifie-le ou demande un nouveau code.',
      )
      expect(replace).not.toHaveBeenCalled()
    })

    it('renvoyer ramène à l’adresse actuelle et dit que deux nouveaux codes sont repartis', async () => {
      vi.setSystemTime(new Date(2026, 9, 22, 18, 5))
      const w = await secondEtape()
      vi.setSystemTime(new Date(2026, 9, 22, 18, 10))

      await toucher(w, '.email-code__resend')

      expect(toastMessage.value).toBe('Deux nouveaux codes ont été envoyés.')
      expect(w.get('.email-code__message').text()).toBe(
        'Code reçu à ton adresse actuelle, sophie@exemple.fr',
      )
    })

    it('revient à l’étape 1 par la flèche, adresse remplie', async () => {
      const w = await secondEtape()

      await toucher(w, '.pushed-screen__back')

      expect((w.get('#email-change-email').element as HTMLInputElement).value).toBe(NOUVELLE)
      expect(replace).not.toHaveBeenCalled()
    })
  })

  it('revient à Compte par la flèche depuis l’étape 1', async () => {
    const w = await monter()

    await toucher(w, '.pushed-screen__back')

    expect(replace).toHaveBeenCalledWith({ name: 'settings-account' })
  })

  it('se lit en anglais', async () => {
    i18n.global.locale.value = 'en'
    try {
      const w = await monter()
      expect(w.get('h1').text()).toBe('Change my email address')
      expect(w.get('label[for="email-change-email"]').text()).toContain('New email address')
      expect(w.text()).toContain(
        'A code will be sent to your current address, then another to the new one.',
      )
      expect(w.get('.email-change__send').text()).toBe('Get the code')
    } finally {
      i18n.global.locale.value = 'fr'
    }
  })
})
