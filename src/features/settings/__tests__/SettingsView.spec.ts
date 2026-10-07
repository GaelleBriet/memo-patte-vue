import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import SettingsView from '../views/SettingsView.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { USER_ID } from '@/features/auth/__tests__/auth-fixture'
import { writePlusAccount } from '@/features/auth/logic/plus-account-storage'
import { memoryStorage } from '@/features/purchase/__tests__/billing-fixture'
import { writeStoredPlusStatus } from '@/features/purchase/logic/plus-status-storage'

const notifications = vi.hoisted(() => ({
  status: 'granted' as string,
  exact: 'precise' as string,
  androidAsked: true,
}))

vi.mock('@/core/notifications/permission', () => ({
  getNotificationPermissionStatus: async () => notifications.status,
  hasAndroidAskedNotifications: async () => notifications.androidAsked,
}))

vi.mock('@/core/notifications/exact-reminders', () => ({
  getExactRemindersStatus: async () => notifications.exact,
  openExactRemindersSettings: async () => notifications.exact,
}))

let push: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-15T10:00:00Z') })
  notifications.status = 'granted'
  notifications.exact = 'precise'
  notifications.androidAsked = true
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', memoryStorage())
  await router.push({ name: 'settings' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  vi.useRealTimers()
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  i18n.global.locale.value = 'fr'
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(SettingsView, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function rubriques(wrapper: VueWrapper) {
  return wrapper.findAll('.settings-row__label').map((label) => label.text())
}

function sousTitre(wrapper: VueWrapper, rubrique: string) {
  return wrapper.get(`.settings-row--${rubrique} .settings-row__hint`).text()
}

describe('SettingsView', () => {
  it('s’intitule « Paramètres » et revient à l’accueil', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Paramètres')
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'home' })
  })

  it('liste toutes les rubriques sans animal ni compte, du plus utile au plus rare (PA-3)', async () => {
    const wrapper = await monter()

    expect(rubriques(wrapper)).toEqual([
      'Rappels',
      'Sauvegarde',
      'Mes données',
      'MémoPatte Plus',
      'Confidentialité',
      'Aide et contact',
      'À propos',
    ])
    expect(wrapper.find('.section-card').exists()).toBe(false)
  })

  it('range Compte juste après MémoPatte Plus quand un compte existe', async () => {
    writePlusAccount({ userId: USER_ID })
    const wrapper = await monter()

    expect(rubriques(wrapper)).toEqual([
      'Rappels',
      'Sauvegarde',
      'Mes données',
      'MémoPatte Plus',
      'Compte',
      'Confidentialité',
      'Aide et contact',
      'À propos',
    ])
  })

  it.each([
    ['reminders', 'settings-reminders'],
    ['backup', 'settings-backup'],
    ['data', 'settings-data'],
    ['plus', 'settings-plus'],
    ['account', 'settings-account'],
    ['privacy', 'settings-privacy'],
    ['help', 'settings-help'],
    ['about', 'settings-about'],
  ])('ouvre la page de la rubrique %s', async (rubrique, route) => {
    writePlusAccount({ userId: USER_ID })
    const wrapper = await monter()

    await wrapper.get(`.settings-row--${rubrique}`).trigger('click')

    expect(push).toHaveBeenCalledWith({ name: route })
  })

  describe('sous-titres d’état (PA-2 bis)', () => {
    it.each([
      ['granted', 'precise', 'Autorisés · rappels précis'],
      ['granted', 'removed', 'Autorisés'],
      ['unasked', 'never-enabled', 'Pas encore activés'],
      ['disabled', 'precise', 'Désactivés'],
    ])('Rappels : notifications %s, rappels précis %s', async (status, exact, resume) => {
      notifications.status = status
      notifications.exact = exact
      const wrapper = await monter()

      expect(sousTitre(wrapper, 'reminders')).toBe(resume)
    })

    it('Rappels : après « Plus tard », Android n’ayant jamais demandé, « Pas encore activés »', async () => {
      notifications.status = 'disabled'
      notifications.androidAsked = false
      const wrapper = await monter()

      expect(sousTitre(wrapper, 'reminders')).toBe('Pas encore activés')
    })

    it('Rappels : rien tant qu’Android n’a pas répondu', async () => {
      notifications.status = 'unavailable'
      const wrapper = await monter()

      expect(wrapper.find('.settings-row--reminders .settings-row__hint').exists()).toBe(false)
    })

    it('Sauvegarde, Mes données, MémoPatte Plus et À propos, sans Plus', async () => {
      const wrapper = await monter()

      expect(sousTitre(wrapper, 'backup')).toBe('Sur ce téléphone')
      expect(sousTitre(wrapper, 'data')).toBe('Unité, export, PDF, import')
      expect(sousTitre(wrapper, 'plus')).toBe('Sauvegarde cloud, plusieurs appareils')
      expect(sousTitre(wrapper, 'about')).toBe(`MémoPatte ${import.meta.env.VITE_APP_VERSION}`)
    })

    it('MémoPatte Plus : le statut d’un abonné', async () => {
      writeStoredPlusStatus({ plan: 'annual', expiresAt: '2027-09-14T10:00:00Z' })
      const wrapper = await monter()

      expect(sousTitre(wrapper, 'plus')).toBe('Plus annuel jusqu’au 14/09/2027')
    })

    it('Confidentialité, Compte et Aide et contact n’ont pas de sous-titre', async () => {
      writePlusAccount({ userId: USER_ID })
      const wrapper = await monter()

      expect(wrapper.find('.settings-row--privacy .settings-row__hint').exists()).toBe(false)
      expect(wrapper.find('.settings-row--help .settings-row__hint').exists()).toBe(false)
      expect(wrapper.find('.settings-row--account .settings-row__hint').exists()).toBe(false)
    })
  })

  it('se lit en anglais (V27)', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Settings')
    expect(rubriques(wrapper)).toEqual([
      'Reminders',
      'Backup',
      'My data',
      'MémoPatte Plus',
      'Privacy',
      'Help & contact',
      'About',
    ])
    expect(sousTitre(wrapper, 'reminders')).toBe('Allowed · exact reminders')
    expect(sousTitre(wrapper, 'backup')).toBe('On this phone')
    expect(sousTitre(wrapper, 'data')).toBe('Unit, export, PDF, import')
    expect(sousTitre(wrapper, 'plus')).toBe('Cloud backup, multiple devices')
  })
})
