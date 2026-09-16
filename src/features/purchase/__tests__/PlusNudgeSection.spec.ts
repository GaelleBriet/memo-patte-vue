import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { memoryStorage } from './billing-fixture'
import { billingService, type BillingService } from '../billing.service'
import { readPlusNudgeState } from '../plus-nudge'
import PlusNudgeSection from '../PlusNudgeSection.vue'
import { writeStoredPlusStatus } from '../plus-status-storage'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { recordPlusNudgeSignal } from '@/shared/plus-nudge-signals'

vi.mock('../billing.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  billingService: {
    isAvailable: vi.fn<BillingService['isAvailable']>(() => true),
    listOffers: vi.fn<BillingService['listOffers']>(),
    purchase: vi.fn<BillingService['purchase']>(),
    fetchStatus: vi.fn<BillingService['fetchStatus']>(),
    restore: vi.fn<BillingService['restore']>(),
    logIn: vi.fn<BillingService['logIn']>(),
  },
}))

const service = vi.mocked(billingService)

let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.clearAllMocks()
  service.isAvailable.mockReturnValue(true)
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-16T10:00:00Z') })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function monter() {
  await router.push('/')
  wrapper = mount(PlusNudgeSection, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

describe('PlusNudgeSection', () => {
  it('ne montre rien tant qu’aucun moment de valeur n’est atteint', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
  })

  it('reprend les mots de la maquette pour la première photo', async () => {
    recordPlusNudgeSignal('photo')
    const wrapper = await monter()

    const carte = wrapper.get('.plus-nudge')
    expect(carte.get('.plus-nudge__title').text()).toBe(
      'Cette photo n’est pas dans la sauvegarde Android',
    )
    expect(carte.get('.plus-nudge__body').text()).toBe(
      'MémoPatte Plus la met à l’abri, elle aussi.',
    )
    expect(carte.get('.plus-nudge__discover').text()).toBe('Découvrir')
    expect(carte.get('.plus-nudge__stop').text()).toBe('Ne plus me le proposer')
  })

  it('reprend les mots de la maquette pour le carnet qui grandit', async () => {
    recordPlusNudgeSignal('animal')
    recordPlusNudgeSignal('animal')
    const wrapper = await monter()

    expect(wrapper.get('.plus-nudge__title').text()).toBe('Ton carnet commence à valoir de l’or')
    expect(wrapper.get('.plus-nudge__body').text()).toBe('Mets-le à l’abri avec MémoPatte Plus.')
  })

  it('reprend les mots de la maquette pour le premier export', async () => {
    recordPlusNudgeSignal('export')
    const wrapper = await monter()

    expect(wrapper.get('.plus-nudge__title').text()).toBe('Ton export est prêt')
    expect(wrapper.get('.plus-nudge__body').text()).toBe(
      'Avec Plus, plus besoin d’y penser : tout se sauvegarde seul.',
    )
  })

  it('mène à l’écran Plus depuis « Découvrir »', async () => {
    recordPlusNudgeSignal('export')
    const wrapper = await monter()

    await wrapper.get('.plus-nudge__discover').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plus'))
  })

  it('se referme par la croix sans couper les rappels suivants', async () => {
    recordPlusNudgeSignal('export')
    const wrapper = await monter()

    await wrapper.get('.plus-nudge__close').trigger('click')

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
    expect(readPlusNudgeState().stopped).toBe(false)
  })

  it('coupe définitivement les rappels avec « Ne plus me le proposer »', async () => {
    recordPlusNudgeSignal('export')
    const wrapper = await monter()

    await wrapper.get('.plus-nudge__stop').trigger('click')

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
    expect(readPlusNudgeState().stopped).toBe(true)
  })

  it('ne revient pas au montage suivant, un rappel par déclencheur', async () => {
    recordPlusNudgeSignal('export')
    const premier = await monter()
    expect(premier.find('.plus-nudge').exists()).toBe(true)
    premier.unmount()

    const second = await monter()
    expect(second.find('.plus-nudge').exists()).toBe(false)
  })

  it('se tait pour un abonné Plus', async () => {
    recordPlusNudgeSignal('export')
    writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })
    const wrapper = await monter()

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
  })

  it('se tait quand les achats sont indisponibles', async () => {
    recordPlusNudgeSignal('export')
    service.isAvailable.mockReturnValue(false)
    const wrapper = await monter()

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
  })

  it('reste annonçable et atteignable au doigt', async () => {
    recordPlusNudgeSignal('photo')
    const wrapper = await monter()

    const carte = wrapper.get('.plus-nudge')
    expect(carte.element.tagName).toBe('ASIDE')
    expect(carte.attributes('aria-label')).toBe('MémoPatte Plus')
    expect(carte.get('.plus-nudge__close').attributes('aria-label')).toBe('Fermer ce rappel')
  })
})
