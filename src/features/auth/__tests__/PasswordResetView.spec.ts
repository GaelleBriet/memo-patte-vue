import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { AccountError } from '../logic/account-error'
import { authRepository, type AuthRepository } from '../repository/auth.repository'
import { provideAuthRepository } from '../store/auth.store'
import PasswordResetView from '../views/PasswordResetView.vue'
import PasswordField from '@/shared/form/PasswordField.vue'
import { memoryStorage, USER_ID } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { toastMessage } from '@/shared/utils/toast'

vi.mock('../repository/auth.repository', () => ({
  authRepository: {
    signUp: vi.fn<AuthRepository['signUp']>(),
    verifySignUpCode: vi.fn<AuthRepository['verifySignUpCode']>(),
    resendSignUpCode: vi.fn<AuthRepository['resendSignUpCode']>(),
    sendPasswordResetCode: vi.fn<AuthRepository['sendPasswordResetCode']>(),
    discardSession: vi.fn<AuthRepository['discardSession']>(async () => {}),
    verifyPasswordResetCode: vi.fn<AuthRepository['verifyPasswordResetCode']>(),
    updatePassword: vi.fn<AuthRepository['updatePassword']>(),
    signIn: vi.fn<AuthRepository['signIn']>(),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
    restoreSession: vi.fn<AuthRepository['restoreSession']>(),
    refreshSession: vi.fn<AuthRepository['refreshSession']>(),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
  },
}))

const repository = vi.mocked(authRepository)
provideAuthRepository(() => authRepository)
const Vide = { render: () => null }
const ADRESSE = 'sophie@exemple.fr'
const ENVOI = new Date(2026, 9, 22, 18, 0)

let routeur: Router
let replace: MockInstance

function routeurMemoire(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/plus', name: 'plus', component: Vide },
      { path: '/plus/account', name: 'plus-account', component: Vide },
      { path: '/sign-in', name: 'sign-in', component: Vide },
      { path: '/sign-in/password-reset', name: 'password-reset', component: Vide },
      { path: '/settings/account/password', name: 'settings-account-password', component: Vide },
    ],
  })
}

async function monter(email = ADRESSE, { locked = false } = {}): Promise<VueWrapper> {
  await routeur.replace({
    name: 'password-reset',
    query: { from: 'plus-account' },
    state: { email, ...(locked ? { emailLocked: true } : {}) },
  })
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
  const wrapper = mount(PasswordResetView, {
    attachTo: document.body,
    global: { plugins: [vuetify, i18n, routeur] },
  })
  await flushPromises()
  return wrapper
}

async function toucher(wrapper: VueWrapper, selecteur: string): Promise<void> {
  await wrapper.get(selecteur).trigger('click')
  await flushPromises()
}

async function codeEnvoye(): Promise<VueWrapper> {
  const wrapper = await monter()
  await toucher(wrapper, '.password-reset__send')
  return wrapper
}

async function saisirCodeEtMotDePasse(
  wrapper: VueWrapper,
  code: string,
  motDePasse: string,
): Promise<void> {
  await wrapper.get('#email-code-input').setValue(code)
  await wrapper.get('#password-reset-new-password').setValue(motDePasse)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: ENVOI })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  routeur = routeurMemoire()
  repository.sendPasswordResetCode.mockResolvedValue()
  repository.verifyPasswordResetCode.mockResolvedValue({ userId: USER_ID })
  repository.updatePassword.mockResolvedValue({ userId: USER_ID })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function champsDeMotDePasse(w: VueWrapper): (string | undefined)[] {
  return w.findAllComponents(PasswordField).map((champ) => champ.get('input').attributes('id'))
}

describe('PasswordResetView', () => {
  describe('adresse (V24 septies)', () => {
    it('s’intitule « Mot de passe oublié » et reprend l’adresse tapée à la connexion', async () => {
      const wrapper = await monter()

      expect(wrapper.get('h1').text()).toBe('Mot de passe oublié')
      expect(wrapper.get('.password-reset__intro').text()).toBe(
        'Indique l’adresse de ton compte. Un code à 8 chiffres y sera envoyé.',
      )
      expect(wrapper.get('label[for="password-reset-email"]').text()).toContain('Adresse e-mail')
      expect((wrapper.get('#password-reset-email').element as HTMLInputElement).value).toBe(ADRESSE)
      expect(wrapper.get('.password-reset__send').text()).toBe('Recevoir le code')
    })

    it('envoie le code puis passe à l’écran du code', async () => {
      const wrapper = await codeEnvoye()

      expect(repository.sendPasswordResetCode).toHaveBeenCalledWith(ADRESSE)
      expect(wrapper.get('.email-code__message').text()).toBe(
        'Entre le code à 8 chiffres envoyé à sophie@exemple.fr, puis choisis un nouveau mot de passe.',
      )
    })

    it('n’envoie rien pour une adresse vide', async () => {
      const wrapper = await monter('')

      await toucher(wrapper, '.password-reset__send')

      expect(repository.sendPasswordResetCode).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Saisis ton adresse e-mail.')
    })

    it('signale l’absence de réseau sous l’adresse', async () => {
      repository.sendPasswordResetCode.mockRejectedValue(new AccountError('offline'))
      const wrapper = await monter()

      await toucher(wrapper, '.password-reset__send')

      expect(wrapper.text()).toContain('Pas de connexion internet. Vérifie ton réseau et réessaie.')
    })

    it('revient à la connexion par la flèche', async () => {
      const wrapper = await monter()

      await toucher(wrapper, '.pushed-screen__back')

      expect(replace).toHaveBeenCalledWith({ name: 'sign-in', query: { from: 'plus-account' } })
    })
  })

  describe('code et nouveau mot de passe (V24 octies, nonies)', () => {
    it('porte le champ partagé avec l’icône œil pour le nouveau mot de passe', async () => {
      const wrapper = await codeEnvoye()

      expect(champsDeMotDePasse(wrapper)).toEqual(['password-reset-new-password'])
    })

    it('montre « Code reçu », le nouveau mot de passe et « Renvoyer le code », sans « Changer d’adresse »', async () => {
      const wrapper = await codeEnvoye()

      expect(wrapper.get('.email-code__label').text()).toBe('Code reçu')
      expect(wrapper.get('#email-code-input').attributes('aria-label')).toBe(
        'Code à 8 chiffres reçu par e-mail',
      )
      expect(wrapper.get('label[for="password-reset-new-password"]').text()).toContain(
        'Nouveau mot de passe',
      )
      expect(wrapper.get('#password-reset-new-password').attributes('autocomplete')).toBe(
        'new-password',
      )
      expect(wrapper.text()).toContain('Au moins 8 caractères.')
      expect(wrapper.get('.email-code__resend').text()).toBe('Renvoyer le code')
      expect(wrapper.find('.email-code__change').exists()).toBe(false)
      expect(wrapper.get('.password-reset__submit').text()).toBe('Réinitialiser')
    })

    it('grise « Réinitialiser » tant qu’il manque un chiffre', async () => {
      const wrapper = await codeEnvoye()

      await wrapper.get('#email-code-input').setValue('12345')
      expect(wrapper.get('.password-reset__submit').attributes('disabled')).toBeDefined()

      await wrapper.get('#email-code-input').setValue('12345678')
      expect(wrapper.get('.password-reset__submit').attributes('disabled')).toBeUndefined()
    })

    it('change le mot de passe, dit « Mot de passe modifié. » et reprend le parcours d’origine', async () => {
      const wrapper = await codeEnvoye()
      await saisirCodeEtMotDePasse(wrapper, '12345678', 'nouveau-secret')

      await toucher(wrapper, '.password-reset__submit')

      expect(repository.verifyPasswordResetCode).toHaveBeenCalledWith(ADRESSE, '12345678')
      expect(repository.updatePassword).toHaveBeenCalledWith('nouveau-secret')
      expect(toastMessage.value).toBe('Mot de passe modifié.')
      expect(replace).toHaveBeenCalledWith({ name: 'plus-account' })
    })

    it('dit « pas le bon » pour un code refusé (V24 nonies)', async () => {
      repository.verifyPasswordResetCode.mockRejectedValue(new AccountError('invalid-code'))
      const wrapper = await codeEnvoye()
      await saisirCodeEtMotDePasse(wrapper, '00000000', 'nouveau-secret')

      await toucher(wrapper, '.password-reset__submit')

      expect(wrapper.get('.email-code__error').text()).toBe(
        'Ce code n’est pas le bon. Vérifie-le ou demande un nouveau code.',
      )
      expect(repository.updatePassword).not.toHaveBeenCalled()
    })

    it('refuse le mot de passe actuel sous le champ du nouveau', async () => {
      repository.updatePassword.mockRejectedValue(new AccountError('same-password'))
      const wrapper = await codeEnvoye()
      await saisirCodeEtMotDePasse(wrapper, '12345678', 'ancien-secret')

      await toucher(wrapper, '.password-reset__submit')

      expect(wrapper.text()).toContain('Choisis un mot de passe différent de l’actuel.')
      expect(wrapper.text()).not.toContain('Au moins 8 caractères.')
    })

    it('exige 8 caractères avant de rien envoyer', async () => {
      const wrapper = await codeEnvoye()
      await saisirCodeEtMotDePasse(wrapper, '12345678', 'court')

      await toucher(wrapper, '.password-reset__submit')

      expect(wrapper.text()).toContain('Choisis un mot de passe d’au moins 8 caractères.')
      expect(repository.verifyPasswordResetCode).not.toHaveBeenCalled()
    })

    it('renvoie le code du mot de passe oublié une minute après, avec le toast de l’inscription', async () => {
      const wrapper = await codeEnvoye()
      vi.setSystemTime(new Date(ENVOI.getTime() + 60_000))

      await toucher(wrapper, '.email-code__resend')

      expect(repository.sendPasswordResetCode).toHaveBeenCalledTimes(2)
      expect(repository.resendSignUpCode).not.toHaveBeenCalled()
      expect(toastMessage.value).toBe('Nouveau code envoyé à sophie@exemple.fr.')
    })

    it('revient à l’adresse, remplie, par la flèche', async () => {
      const wrapper = await codeEnvoye()

      await toucher(wrapper, '.pushed-screen__back')

      expect((wrapper.get('#password-reset-email').element as HTMLInputElement).value).toBe(ADRESSE)
      expect(replace).not.toHaveBeenCalled()
    })
  })

  it('depuis « Changer mon mot de passe », la flèche y revient, pas à la connexion', async () => {
    await routeur.replace({
      name: 'password-reset',
      query: { from: 'settings-account' },
      state: { email: ADRESSE, emailLocked: true },
    })
    replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
    const wrapper = mount(PasswordResetView, {
      attachTo: document.body,
      global: { plugins: [vuetify, i18n, routeur] },
    })
    await flushPromises()

    await toucher(wrapper, '.pushed-screen__back')

    expect(replace).toHaveBeenCalledWith({ name: 'settings-account-password' })
  })

  it('verrouille l’adresse quand elle vient du compte', async () => {
    const wrapper = await monter(ADRESSE, { locked: true })

    expect(wrapper.get('#password-reset-email').attributes('readonly')).toBeDefined()
    await toucher(wrapper, '.password-reset__send')
    expect(repository.sendPasswordResetCode).toHaveBeenCalledWith(ADRESSE)
  })

  it('grise « Renvoyer le code » pendant la vérification', async () => {
    let finir: (value: { userId: string }) => void = () => {}
    repository.verifyPasswordResetCode.mockReturnValue(new Promise((resolve) => (finir = resolve)))
    const wrapper = await codeEnvoye()
    await saisirCodeEtMotDePasse(wrapper, '12345678', 'nouveau-secret')

    await wrapper.get('.password-reset__submit').trigger('click')
    await flushPromises()
    expect(wrapper.get('.email-code__resend').attributes('disabled')).toBeDefined()

    finir({ userId: USER_ID })
    await flushPromises()
  })

  it('se lit en anglais', async () => {
    i18n.global.locale.value = 'en'
    try {
      const wrapper = await monter()
      expect(wrapper.get('h1').text()).toBe('Forgot password')
      expect(wrapper.get('.password-reset__intro').text()).toBe(
        'Enter your account’s address. An 8-digit code will be sent to it.',
      )
      expect(wrapper.get('.password-reset__send').text()).toBe('Get the code')

      await toucher(wrapper, '.password-reset__send')

      expect(wrapper.get('.email-code__message').text()).toBe(
        'Enter the 8-digit code sent to sophie@exemple.fr, then choose a new password.',
      )
      expect(wrapper.get('.email-code__label').text()).toBe('Code received')
      expect(wrapper.get('#email-code-input').attributes('aria-label')).toBe(
        '8-digit code received by email',
      )
      expect(wrapper.get('label[for="password-reset-new-password"]').text()).toContain(
        'New password',
      )
      expect(wrapper.get('.password-reset__submit').text()).toBe('Reset')
    } finally {
      i18n.global.locale.value = 'fr'
    }
  })
})
