import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { memoryStorage } from './billing-fixture'
import { billingService, type BillingService } from '../billing.service'
import { forgetPlusNudgeSession, readPlusNudgeState } from '../plus-nudge'
import PlusNudgeSection from '../PlusNudgeSection.vue'
import { writeStoredPlusStatus } from '../plus-status-storage'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { recordUsageSignal } from '@/shared/usage-signals'

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
  forgetPlusNudgeSession()
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function monter(animalCount = 1) {
  await router.push('/')
  wrapper = mount(PlusNudgeSection, {
    props: { animalCount },
    global: { plugins: [vuetify, i18n, router] },
  })
  await flushPromises()
  return wrapper
}

describe('PlusNudgeSection', () => {
  it('ne montre rien tant qu’aucun moment de valeur n’est atteint', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
  })

  it('reprend les mots de la maquette pour la première photo', async () => {
    recordUsageSignal('photo')
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

  it('compte les animaux du Carnet, sans compteur à lui', async () => {
    const seul = await monter(1)
    expect(seul.find('.plus-nudge').exists()).toBe(false)
    seul.unmount()

    const foyer = await monter(2)
    expect(foyer.get('.plus-nudge__title').text()).toBe('Ton carnet commence à valoir de l’or')
    expect(foyer.get('.plus-nudge__body').text()).toBe('Mets-le à l’abri avec MémoPatte Plus.')
  })

  it('reprend les mots de la maquette pour le premier export', async () => {
    recordUsageSignal('export')
    const wrapper = await monter()

    expect(wrapper.get('.plus-nudge__title').text()).toBe('Ton export est prêt')
    expect(wrapper.get('.plus-nudge__body').text()).toBe(
      'Avec Plus, plus besoin d’y penser : tout se sauvegarde seul.',
    )
  })

  it('mène à l’écran Plus depuis « Découvrir »', async () => {
    recordUsageSignal('export')
    const wrapper = await monter()

    await wrapper.get('.plus-nudge__discover').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plus'))
  })

  it('se referme par la croix sans couper les rappels suivants', async () => {
    recordUsageSignal('export')
    const wrapper = await monter()

    await wrapper.get('.plus-nudge__close').trigger('click')

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
    expect(readPlusNudgeState().stopped).toBe(false)
  })

  it('coupe définitivement les rappels avec « Ne plus me le proposer »', async () => {
    recordUsageSignal('export')
    const wrapper = await monter()

    await wrapper.get('.plus-nudge__stop').trigger('click')

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
    expect(readPlusNudgeState().stopped).toBe(true)
  })

  it('ne revient pas au montage suivant, un rappel par déclencheur', async () => {
    recordUsageSignal('export')
    const premier = await monter()
    expect(premier.find('.plus-nudge').exists()).toBe(true)
    premier.unmount()

    const second = await monter()
    expect(second.find('.plus-nudge').exists()).toBe(false)
  })

  it('se tait pour un abonné Plus', async () => {
    recordUsageSignal('export')
    writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })
    const wrapper = await monter()

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
  })

  it('se tait pour un ancien abonné, qui a déjà le bandeau « en pause »', async () => {
    recordUsageSignal('export')
    writeStoredPlusStatus({
      plan: 'none',
      expiresAt: null,
      lastSubscription: 'annual',
      subscriptionEndedAt: '2026-09-11T10:00:00Z',
    })
    const wrapper = await monter()

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
  })

  it('se tait quand les achats sont indisponibles', async () => {
    recordUsageSignal('export')
    service.isAvailable.mockReturnValue(false)
    const wrapper = await monter()

    expect(wrapper.find('.plus-nudge').exists()).toBe(false)
  })

  it('reste annonçable et atteignable au doigt', async () => {
    recordUsageSignal('photo')
    const wrapper = await monter()

    const carte = wrapper.get('.plus-nudge')
    expect(carte.element.tagName).toBe('ASIDE')
    expect(carte.attributes('aria-labelledby')).toBe(
      carte.get('.plus-nudge__title').attributes('id'),
    )
    expect(carte.get('.plus-nudge__close').attributes('aria-label')).toBe('Fermer ce rappel')
  })
})
