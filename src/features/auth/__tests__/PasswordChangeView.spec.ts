import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { AccountError } from '../logic/account-error'
import { writePlusAccount } from '../logic/plus-account-storage'
import { authRepository } from '../repository/auth.repository'
import { provideAuthRepository } from '../store/auth.store'
import PasswordChangeView from '../views/PasswordChangeView.vue'
import { memoryStorage, USER_ID } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { toastMessage } from '@/shared/utils/toast'

let replace: MockInstance
let push: MockInstance
let reauthenticate: MockInstance<typeof authRepository.reauthenticate>
let updatePassword: MockInstance<typeof authRepository.updatePassword>
let wrapper: VueWrapper | null = null

provideAuthRepository(() => authRepository)

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  writePlusAccount({ userId: USER_ID })
  await router.push({ name: 'settings-account-password' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
  push = vi.spyOn(router, 'push').mockResolvedValue()
  vi.spyOn(authRepository, 'accountIdentity').mockResolvedValue({
    kind: 'password',
    email: 'sophie@exemple.fr',
  })
  reauthenticate = vi.spyOn(authRepository, 'reauthenticate').mockResolvedValue({ userId: USER_ID })
  updatePassword = vi.spyOn(authRepository, 'updatePassword').mockResolvedValue({ userId: USER_ID })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(PasswordChangeView, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

async function remplir(w: VueWrapper, actuel: string, nouveau: string) {
  await w.get('#password-change-current').setValue(actuel)
  await w.get('#password-change-next').setValue(nouveau)
}

async function enregistrer(w: VueWrapper) {
  await w.get('.password-change__save').trigger('click')
  await flushPromises()
}

describe('PasswordChangeView (V24 ter)', () => {
  it('demande l’actuel, propose « Mot de passe oublié ? », puis le nouveau et « Enregistrer »', async () => {
    const w = await monter()

    expect(w.get('h1').text()).toBe('Changer mon mot de passe')
    expect(w.get('label[for="password-change-current"]').text()).toContain('Mot de passe actuel')
    expect(w.get('#password-change-current').attributes('autocomplete')).toBe('current-password')
    expect(w.get('.password-change__forgot').text()).toBe('Mot de passe oublié ?')
    expect(w.get('label[for="password-change-next"]').text()).toContain('Nouveau mot de passe')
    expect(w.get('#password-change-next').attributes('autocomplete')).toBe('new-password')
    expect(w.text()).toContain('Au moins 8 caractères.')
    const save = w.get('.password-change__save')
    expect(save.text()).toBe('Enregistrer')
    expect(save.attributes('aria-label')).toBe('Enregistrer le nouveau mot de passe')
  })

  it('reconnecte avec l’actuel, enregistre le nouveau, puis revient à Compte avec le toast', async () => {
    const w = await monter()
    await remplir(w, 'ancien-secret', 'nouveau-secret')

    await enregistrer(w)

    expect(reauthenticate).toHaveBeenCalledWith('ancien-secret')
    expect(updatePassword).toHaveBeenCalledWith('nouveau-secret')
    expect(toastMessage.value).toBe('Mot de passe modifié.')
    expect(replace).toHaveBeenCalledWith({ name: 'settings-account' })
  })

  it('dit « Mot de passe incorrect. Réessaie. » quand l’actuel est faux', async () => {
    reauthenticate.mockRejectedValue(new AccountError('invalid-credentials'))
    const w = await monter()
    await remplir(w, 'faux', 'nouveau-secret')

    await enregistrer(w)

    expect(w.text()).toContain('Mot de passe incorrect. Réessaie.')
    expect(updatePassword).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('refuse un nouveau mot de passe identique à l’actuel', async () => {
    updatePassword.mockRejectedValue(new AccountError('same-password'))
    const w = await monter()
    await remplir(w, 'ancien-secret', 'ancien-secret')

    await enregistrer(w)

    expect(w.text()).toContain('Choisis un mot de passe différent de l’actuel.')
  })

  it('signale l’absence de réseau', async () => {
    reauthenticate.mockRejectedValue(new AccountError('offline'))
    const w = await monter()
    await remplir(w, 'ancien-secret', 'nouveau-secret')

    await enregistrer(w)

    expect(w.get('.password-change__error').text()).toBe(
      'Pas de connexion internet. Vérifie ton réseau et réessaie.',
    )
  })

  it('« Mot de passe oublié ? » remplace l’écran par V24 septies, adresse du compte verrouillée', async () => {
    const w = await monter()

    await w.get('.password-change__forgot').trigger('click')

    expect(replace).toHaveBeenCalledWith({
      name: 'password-reset',
      query: { from: 'settings-account' },
      state: { email: 'sophie@exemple.fr', emailLocked: true },
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('revient à Compte par la flèche', async () => {
    const w = await monter()

    await w.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings-account' })
  })

  it('se lit en anglais', async () => {
    i18n.global.locale.value = 'en'
    try {
      const w = await monter()
      expect(w.get('h1').text()).toBe('Change my password')
      expect(w.get('label[for="password-change-current"]').text()).toContain('Current password')
      expect(w.get('.password-change__forgot').text()).toBe('Forgot password?')
      expect(w.get('label[for="password-change-next"]').text()).toContain('New password')
      expect(w.get('.password-change__save').text()).toBe('Save')
      expect(w.get('.password-change__save').attributes('aria-label')).toBe('Save the new password')
    } finally {
      i18n.global.locale.value = 'fr'
    }
  })
})
