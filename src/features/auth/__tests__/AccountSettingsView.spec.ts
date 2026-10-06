import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { writePlusAccount } from '../logic/plus-account-storage'
import AccountSettingsView from '../views/AccountSettingsView.vue'
import { memoryStorage, USER_ID } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'

let replace: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  writePlusAccount({ userId: USER_ID })
  await router.push({ name: 'settings-account' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
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
  it('s’intitule « Compte », propose la déconnexion et revient à la liste des Paramètres', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Compte')
    expect(wrapper.find('.section-card__title').exists()).toBe(false)
    expect(wrapper.get('.settings-row--sign-out').text()).toBe('Se déconnecter')

    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })
})
