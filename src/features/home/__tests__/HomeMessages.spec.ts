import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import HomeMessages from '../views/HomeMessages.vue'
import { readHomeMessagesMemory, rememberHomeMessages } from '../logic/home-messages-memory'
import type { CarnetCopyService } from '../service/carnet-copy.service'
import { provideCarnetCopyService } from '../store/home-messages.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import {
  getNotificationPermissionStatus,
  hasAndroidAskedNotifications,
  openNotificationSettings,
  type NotificationPermissionStatus,
} from '@/core/notifications/permission'
import vuetify from '@/core/theme/vuetify'
import { writeStoredPlusStatus } from '@/features/purchase/logic/plus-status-storage'
import router from '@/router'
import { readUsageSignals, recordUsageSignal } from '@/shared/utils/usage-signals'
import { toastMessage } from '@/shared/utils/toast'

vi.mock('@/core/notifications/permission', () => ({
  getNotificationPermissionStatus: vi.fn<() => Promise<NotificationPermissionStatus>>(),
  hasAndroidAskedNotifications: vi.fn<() => Promise<boolean>>(),
  openNotificationSettings: vi.fn<() => Promise<void>>(async () => {}),
}))

const NOW = new Date('2026-10-06T10:00:00.000Z')
const permission = vi.mocked(getNotificationPermissionStatus)
const androidAsked = vi.mocked(hasAndroidAskedNotifications)
const share = vi.fn<CarnetCopyService['share']>()

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  }
}

const mounted: VueWrapper[] = []
let push: MockInstance

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  permission.mockResolvedValue('granted')
  androidAsked.mockResolvedValue(true)
  share.mockReset().mockResolvedValue('shared')
  provideCarnetCopyService(() => ({ share }))
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  provideCarnetCopyService(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function monter(place: 'aboveTodo' | 'belowTodo') {
  const wrapper = mount(HomeMessages, {
    props: { place },
    global: { plugins: [vuetify, i18n, router] },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function careSaved(at: string): void {
  vi.setSystemTime(new Date(at))
  recordUsageSignal('care')
  vi.setSystemTime(NOW)
}

describe('HomeMessages — bandeau « Les rappels sont désactivés »', () => {
  it('ne montre rien quand les rappels sont autorisés', async () => {
    const wrapper = await monter('aboveTodo')

    expect(wrapper.find('.home-reminders-off').exists()).toBe(false)
  })

  it('après un refus : « Activer dans les réglages » ouvre les réglages d’Android', async () => {
    permission.mockResolvedValue('disabled')
    const wrapper = await monter('aboveTodo')

    const enable = wrapper.get('.home-reminders-off__enable')
    expect(enable.text()).toContain('Les rappels sont désactivés')
    expect(enable.text()).toContain('Activer dans les réglages')
    await enable.trigger('click')

    expect(openNotificationSettings).toHaveBeenCalledOnce()
  })

  it('après « Plus tard » : « Activer les rappels » ouvre l’écran d’explication', async () => {
    permission.mockResolvedValue('disabled')
    androidAsked.mockResolvedValue(false)
    const wrapper = await monter('aboveTodo')

    const enable = wrapper.get('.home-reminders-off__enable')
    expect(enable.text()).toContain('Activer les rappels')
    await enable.trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'notifications-priming', query: { from: 'home' } })
    expect(openNotificationSettings).not.toHaveBeenCalled()
  })

  it('mène à la page d’aide des rappels', async () => {
    permission.mockResolvedValue('disabled')
    const wrapper = await monter('aboveTodo')

    const help = wrapper.get('.home-reminders-off__help')
    expect(help.text()).toBe('Je ne reçois pas mes rappels')
    expect(help.attributes('href')).toBe('https://memopatte.app/aide/rappels/')
    expect(help.attributes('target')).toBe('_blank')
  })

  it('se ferme, et revient au prochain soin enregistré', async () => {
    permission.mockResolvedValue('disabled')
    const wrapper = await monter('aboveTodo')

    const close = wrapper.get('.home-reminders-off__close')
    expect(close.attributes('aria-label')).toBe('Fermer ce message')
    await close.trigger('click')
    expect(wrapper.find('.home-reminders-off').exists()).toBe(false)

    careSaved('2026-10-06T11:00:00.000Z')
    vi.setSystemTime(new Date('2026-10-06T11:00:00.000Z'))
    simulateWebResume()
    await flushPromises()

    expect(wrapper.find('.home-reminders-off').exists()).toBe(true)
  })

  it('disparaît au retour des réglages quand les rappels ont été autorisés', async () => {
    permission.mockResolvedValue('disabled')
    const wrapper = await monter('aboveTodo')

    permission.mockResolvedValue('granted')
    simulateWebResume()
    await flushPromises()

    expect(wrapper.find('.home-reminders-off').exists()).toBe(false)
  })

  it('n’apparaît pas sous « À faire »', async () => {
    permission.mockResolvedValue('disabled')
    const wrapper = await monter('belowTodo')

    expect(wrapper.html()).toBe('<!--v-if-->')
  })
})

describe('HomeMessages — carte « protéger »', () => {
  beforeEach(() => careSaved('2026-10-05T10:00:00.000Z'))

  it('apparaît sous « À faire » après le premier soin enregistré', async () => {
    const wrapper = await monter('belowTodo')

    const card = wrapper.get('.home-message--protect')
    expect(card.get('.home-message__title').text()).toBe(
      'Ton carnet est sur ce téléphone. Voici comment le protéger',
    )
    expect(card.find('.home-message__body').exists()).toBe(false)
    expect((await monter('aboveTodo')).html()).toBe('<!--v-if-->')
  })

  it('« Voir comment » ouvre Sauvegarde et ferme la carte pour toujours', async () => {
    const wrapper = await monter('belowTodo')

    await wrapper.get('.home-message__action--seeHow').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'settings-backup' })
    expect(readHomeMessagesMemory().protectClosed).toBe(true)
    expect(wrapper.find('.home-message--protect').exists()).toBe(false)
  })

  it('se ferme pour toujours par la croix', async () => {
    const wrapper = await monter('belowTodo')

    const close = wrapper.get('.home-message__close')
    expect(close.attributes('aria-label')).toBe('Fermer ce message')
    await close.trigger('click')

    expect(readHomeMessagesMemory().protectClosed).toBe(true)
    expect(wrapper.find('.home-message').exists()).toBe(false)
  })

  it('ne s’affiche jamais pour un abonné Plus', async () => {
    writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })
    const wrapper = await monter('belowTodo')

    expect(wrapper.find('.home-message').exists()).toBe(false)
  })
})

describe('HomeMessages — carte trimestrielle', () => {
  beforeEach(() => {
    careSaved('2026-07-01T10:00:00.000Z')
    rememberHomeMessages({ protectClosed: true })
  })

  it('propose de mettre une copie à l’abri, trois mois après le premier soin', async () => {
    const wrapper = await monter('belowTodo')

    const card = wrapper.get('.home-message--quarterly')
    expect(card.get('.home-message__title').text()).toBe(
      'Ton carnet n’existe que sur ce téléphone.',
    )
    expect(card.get('.home-message__body').text()).toBe('Mets une copie à l’abri.')
    expect(card.findAll('.home-message__actions .v-btn').map((button) => button.text())).toEqual([
      'Exporter une copie',
      'Découvrir Plus',
      'Ne plus me le proposer',
    ])
    expect(card.get('.home-message__close').attributes('aria-label')).toBe(
      'Masquer jusqu’au prochain trimestre',
    )
  })

  it('« Exporter une copie » partage le JSON ; la carte disparaît une fois partagé', async () => {
    share.mockImplementation(async () => {
      recordUsageSignal('jsonShare')
      return 'shared'
    })
    const wrapper = await monter('belowTodo')

    await wrapper.get('.home-message__action--exportCopy').trigger('click')
    await flushPromises()

    expect(share).toHaveBeenCalledOnce()
    expect(toastMessage.value).toBe('Données exportées')
    expect(wrapper.find('.home-message').exists()).toBe(false)
  })

  it('reste là quand le partage est annulé', async () => {
    share.mockResolvedValue('cancelled')
    const wrapper = await monter('belowTodo')

    await wrapper.get('.home-message__action--exportCopy').trigger('click')
    await flushPromises()

    expect(wrapper.find('.home-message--quarterly').exists()).toBe(true)
  })

  it('dit l’échec et reste là quand l’export échoue', async () => {
    share.mockResolvedValue('failed')
    const wrapper = await monter('belowTodo')

    await wrapper.get('.home-message__action--exportCopy').trigger('click')
    await flushPromises()

    expect(toastMessage.value).toBe('L’export n’a pas pu être préparé. Réessaie.')
    expect(wrapper.find('.home-message--quarterly').exists()).toBe(true)
  })

  it('disparaît au retour quand un export JSON a été partagé ailleurs', async () => {
    const wrapper = await monter('belowTodo')

    recordUsageSignal('jsonShare')
    simulateWebResume()
    await flushPromises()

    expect(readUsageSignals().jsonShare.count).toBe(1)
    expect(wrapper.find('.home-message').exists()).toBe(false)
  })

  it('« Découvrir Plus » ouvre l’écran Plus sans fermer la carte', async () => {
    const wrapper = await monter('belowTodo')

    await wrapper.get('.home-message__action--discoverPlus').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'plus' })
    expect(wrapper.find('.home-message--quarterly').exists()).toBe(true)
  })

  it('la croix la cache jusqu’au trimestre suivant', async () => {
    const wrapper = await monter('belowTodo')

    await wrapper.get('.home-message__close').trigger('click')

    expect(readHomeMessagesMemory().quarterlyClosedAt).toBe(NOW.toISOString())
    expect(wrapper.find('.home-message').exists()).toBe(false)
  })

  it('« Ne plus me le proposer » la retire pour toujours', async () => {
    const wrapper = await monter('belowTodo')

    await wrapper.get('.home-message__action--stopQuarterly').trigger('click')

    expect(readHomeMessagesMemory().quarterlyStopped).toBe(true)
    expect(wrapper.find('.home-message').exists()).toBe(false)
  })
})
