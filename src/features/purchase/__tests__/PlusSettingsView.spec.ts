import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { writeStoredPlusStatus } from '../logic/plus-status-storage'
import { billingService } from '../service/billing.service'
import { installPlusStatusRefresh } from '../service/plus-status-refresh.service'
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
  let uninstall: () => void = () => {}

  afterEach(() => uninstall())

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
    expect(wrapper.get('.settings-row--plus-sign-in .settings-row__hint').text()).toBe(
      'Retrouver mon carnet',
    )
    expect(wrapper.text()).not.toContain('abonné')
  })

  it('ouvre la connexion depuis « J’ai déjà MémoPatte Plus », puis la restauration du carnet', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--plus-sign-in').trigger('click')

    expect(push).toHaveBeenCalledWith({
      name: 'sign-in',
      query: { from: 'settings-plus', restore: '1' },
    })
  })

  it('dit « Restore my health record » en anglais, comme le lien de l’accueil', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monter()

    expect(wrapper.get('.settings-row--plus-sign-in .settings-row__hint').text()).toBe(
      'Restore my health record',
    )
  })

  it('ne propose pas la connexion sans configuration Supabase', async () => {
    authAvailable.mockReturnValue(false)
    const wrapper = await monter()

    expect(wrapper.find('.settings-row--plus-discover').exists()).toBe(true)
    expect(wrapper.find('.settings-row--plus-sign-in').exists()).toBe(false)
  })

  it('donne le statut, « Gérer mon abonnement », et ne propose pas la connexion à un abonné (V19 quater)', async () => {
    writeStoredPlusStatus({ plan: 'annual', expiresAt: new Date(2027, 8, 14, 10).toISOString() })
    const wrapper = await monter()

    expect(wrapper.get('.settings-row--plus-status').text()).toContain(
      'Plus annuel jusqu’au 14/09/2027',
    )
    expect(wrapper.find('.settings-row--manage-subscription').exists()).toBe(true)
    expect(wrapper.find('.settings-row--plus-sign-in').exists()).toBe(false)
  })

  it('dit « subscription » en anglais, jamais « plan »', async () => {
    i18n.global.locale.value = 'en'
    writeStoredPlusStatus({ plan: 'annual', expiresAt: new Date(2027, 8, 14, 10).toISOString() })
    const wrapper = await monter()

    expect(wrapper.text()).toContain('subscription')
    expect(wrapper.text()).not.toMatch(/\bplan\b/i)
  })

  it('passe de lui-même à « expiré » quand l’échéance passe, app restée ouverte', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
      now: new Date(2026, 8, 15, 10),
    })
    const monthly = {
      plan: 'monthly' as const,
      expiresAt: new Date(2026, 8, 15, 10, 5).toISOString(),
    }
    writeStoredPlusStatus(monthly)
    vi.spyOn(billingService, 'fetchStatus').mockResolvedValue(monthly)
    uninstall = installPlusStatusRefresh()
    const wrapper = await monter()
    expect(wrapper.get('.settings-row--plus-status').text()).toContain(
      'Plus mensuel jusqu’au 15/09/2026',
    )

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await flushPromises()

    expect(wrapper.get('.settings-row--plus-status').text()).toContain('Plus mensuel — expiré')
  })
})
