import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { writeStoredPlusStatus } from '../logic/plus-status-storage'
import PlusSettingsView from '../views/PlusSettingsView.vue'
import { memoryStorage } from './billing-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'

const authAvailable = vi.hoisted(() => vi.fn<() => boolean>(() => true))

vi.mock('@/shared/utils/auth-available', () => ({ authAvailable }))

let push: MockInstance
let replace: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-15T10:00:00Z') })
  authAvailable.mockReturnValue(true)
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  await router.push({ name: 'settings-plus' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
})

afterEach(() => {
  vi.useRealTimers()
  wrapper?.unmount()
  wrapper = null
  i18n.global.locale.value = 'fr'
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(PlusSettingsView, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

describe('PlusSettingsView', () => {
  it('s’intitule « MémoPatte Plus », sans redire le titre sur la carte, et revient à la liste', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('MémoPatte Plus')
    expect(wrapper.find('.section-card__title').exists()).toBe(false)
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('propose de découvrir Plus, puis « J’ai déjà MémoPatte Plus » (V19 ter)', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.settings-row--plus-discover').text()).toContain('Découvrir MémoPatte Plus')
    expect(wrapper.get('.settings-row--plus-sign-in .settings-row__label').text()).toBe(
      'J’ai déjà MémoPatte Plus',
    )
    expect(wrapper.text()).not.toContain('abonné')
  })

  it('ouvre la connexion depuis « J’ai déjà MémoPatte Plus », et revient sur cette page après', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--plus-sign-in').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'sign-in', query: { from: 'settings-plus' } })
  })

  it('ne propose pas la connexion sans configuration Supabase', async () => {
    authAvailable.mockReturnValue(false)
    const wrapper = await monter()

    expect(wrapper.find('.settings-row--plus-discover').exists()).toBe(true)
    expect(wrapper.find('.settings-row--plus-sign-in').exists()).toBe(false)
  })

  it('donne le statut, « Gérer mon abonnement », et ne propose pas la connexion à un abonné (V19 quater)', async () => {
    writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-09-14T10:00:00Z' })
    const wrapper = await monter()

    expect(wrapper.get('.settings-row--plus-status').text()).toContain(
      'Plus annuel jusqu’au 14/09/2027',
    )
    expect(wrapper.find('.settings-row--manage-subscription').exists()).toBe(true)
    expect(wrapper.find('.settings-row--plus-sign-in').exists()).toBe(false)
  })

  it('dit « subscription » en anglais, jamais « plan »', async () => {
    i18n.global.locale.value = 'en'
    writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-09-14T10:00:00Z' })
    const wrapper = await monter()

    expect(wrapper.text()).toContain('subscription')
    expect(wrapper.text()).not.toMatch(/\bplan\b/i)
  })
})
