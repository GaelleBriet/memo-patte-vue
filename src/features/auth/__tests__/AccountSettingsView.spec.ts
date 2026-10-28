import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { writePlusAccount } from '../logic/plus-account-storage'
import { authRepository } from '../repository/auth.repository'
import { provideAuthRepository, useAuthStore } from '../store/auth.store'
import AccountSettingsView from '../views/AccountSettingsView.vue'
import { memoryStorage, USER_ID } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'

let replace: MockInstance
let accountIdentity: MockInstance<typeof authRepository.accountIdentity>
let wrapper: VueWrapper | null = null

provideAuthRepository(() => authRepository)

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  writePlusAccount({ userId: USER_ID })
  await router.push({ name: 'settings-account' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
  accountIdentity = vi.spyOn(authRepository, 'accountIdentity').mockResolvedValue(null)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(AccountSettingsView, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

describe('AccountSettingsView', () => {
  it('retire l’adresse et le changement de mot de passe quand la session est fermée', async () => {
    accountIdentity.mockResolvedValue({ kind: 'password', email: 'sophie@exemple.fr' })
    const wrapper = await monter()
    expect(wrapper.find('.settings-row--change-password').exists()).toBe(true)

    vi.spyOn(authRepository, 'refreshSession').mockResolvedValue({ kind: 'needs-sign-in' })
    await useAuthStore().refresh()
    await flushPromises()

    expect(wrapper.find('.settings-row--change-password').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('sophie@exemple.fr')
  })

  it('s’intitule « Compte », propose la déconnexion et revient à la liste des Paramètres', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Compte')
    expect(wrapper.find('.section-card__title').exists()).toBe(false)
    expect(wrapper.get('.settings-row--sign-out').text()).toBe('Se déconnecter')

    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('propose « Supprimer mon compte », qui ouvre le parcours de suppression', async () => {
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    const wrapper = await monter()

    const entry = wrapper.get('.settings-row--delete-account')
    expect(entry.text()).toBe('Supprimer mon compte')
    await entry.trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'settings-account-delete' })
  })

  describe('adresse du compte (V24, V24 bis)', () => {
    it('ouvre l’écran sur l’adresse d’un compte qui a un mot de passe', async () => {
      accountIdentity.mockResolvedValue({ kind: 'password', email: 'sophie@exemple.fr' })
      const wrapper = await monter()

      const rows = wrapper.findAll('.settings-row')
      expect(rows[0]!.classes()).toContain('settings-row--account-identity')
      expect(rows[0]!.get('.settings-row__label').text()).toBe('Adresse e-mail')
      expect(rows[0]!.get('.settings-row__hint').text()).toBe('sophie@exemple.fr')
      expect(rows[0]!.element.tagName).toBe('DIV')
    })

    it('dit « Compte Google » avec son adresse pour un compte créé avec Google', async () => {
      accountIdentity.mockResolvedValue({
        kind: 'google',
        email: 'sophie@gmail.com',
        subject: '108234567890',
      })
      const wrapper = await monter()

      const row = wrapper.get('.settings-row--account-identity')
      expect(row.get('.settings-row__label').text()).toBe('Compte Google')
      expect(row.get('.settings-row__hint').text()).toBe('sophie@gmail.com')
    })

    it('ne lit rien sans compte Plus sur l’appareil', async () => {
      vi.stubGlobal('localStorage', memoryStorage())
      setActivePinia(createPinia())
      accountIdentity.mockResolvedValue({ kind: 'password', email: 'sophie@exemple.fr' })
      const wrapper = await monter()

      expect(accountIdentity).not.toHaveBeenCalled()
      expect(wrapper.find('.settings-row--account-identity').exists()).toBe(false)
    })

    it('ne montre pas de ligne quand l’adresse n’est pas lisible', async () => {
      const wrapper = await monter()

      expect(wrapper.find('.settings-row--account-identity').exists()).toBe(false)
      expect(wrapper.get('.settings-row--sign-out').text()).toBe('Se déconnecter')
    })
  })

  describe('« Connexion » (V24)', () => {
    it('propose « Changer mon mot de passe » sous « Connexion » pour un compte à mot de passe', async () => {
      accountIdentity.mockResolvedValue({ kind: 'password', email: 'sophie@exemple.fr' })
      const push = vi.spyOn(router, 'push').mockResolvedValue()
      const wrapper = await monter()

      expect(wrapper.get('.account-settings__section-title').text()).toBe('Connexion')
      const entry = wrapper.get('.settings-row--change-password')
      expect(entry.text()).toBe('Changer mon mot de passe')
      await entry.trigger('click')

      expect(push).toHaveBeenCalledWith({ name: 'settings-account-password' })
    })

    it('propose aussi « Changer mon adresse e-mail », sous « Changer mon mot de passe »', async () => {
      accountIdentity.mockResolvedValue({ kind: 'password', email: 'sophie@exemple.fr' })
      const push = vi.spyOn(router, 'push').mockResolvedValue()
      const wrapper = await monter()

      const rows = wrapper.findAll('.account-settings__sign-in .settings-row')
      expect(rows.map((row) => row.text())).toEqual([
        'Changer mon mot de passe',
        'Changer mon adresse e-mail',
      ])
      await rows[1]!.trigger('click')

      expect(push).toHaveBeenCalledWith({ name: 'settings-account-email' })
    })

    it('ne propose rien de tel pour un compte créé avec Google (V24 bis)', async () => {
      accountIdentity.mockResolvedValue({
        kind: 'google',
        email: 'sophie@gmail.com',
        subject: '108234567890',
      })
      const wrapper = await monter()

      expect(wrapper.find('.account-settings__section-title').exists()).toBe(false)
      expect(wrapper.find('.settings-row--change-password').exists()).toBe(false)
      expect(wrapper.find('.settings-row--change-email').exists()).toBe(false)
    })
  })
})
