import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

import type { CarnetSettings } from '../schema/carnet-settings.schema'
import { provideCarnetSettingsRepository } from '../store/carnet-settings.store'
import RemindersSettingsView from '../views/RemindersSettingsView.vue'
import i18n, { applyLocale } from '@/core/i18n'
import {
  getExactRemindersStatus,
  openExactRemindersSettings,
  type ExactRemindersStatus,
} from '@/core/notifications/exact-reminders'
import {
  getNotificationPermissionStatus,
  openNotificationSettings,
  type NotificationPermissionStatus,
} from '@/core/notifications/permission'
import vuetify from '@/core/theme/vuetify'
import { routeurMemoire } from '@/router/__tests__/routeur-memoire'
import { toastMessage, toastTone } from '@/shared/utils/toast'

vi.mock('@/core/notifications/permission', () => ({
  getNotificationPermissionStatus: vi.fn<() => Promise<NotificationPermissionStatus>>(),
  openNotificationSettings: vi.fn<() => Promise<void>>(async () => {}),
}))

vi.mock('@/core/notifications/exact-reminders', () => ({
  getExactRemindersStatus: vi.fn<() => Promise<ExactRemindersStatus>>(),
  openExactRemindersSettings: vi.fn<() => Promise<ExactRemindersStatus>>(),
}))

vi.mock('@/core/app-lifecycle/back-button', () => ({
  onBackButton: vi.fn<(handler: () => void) => () => void>(() => () => {}),
}))

const NBSP = /[  ]/g
const permission = vi.mocked(getNotificationPermissionStatus)
const exact = vi.mocked(getExactRemindersStatus)

let saved: CarnetSettings
const get = vi.fn<() => Promise<CarnetSettings>>()
const update = vi.fn<(changes: Partial<CarnetSettings>) => Promise<CarnetSettings>>()
let router: Router
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 411,
    height: 815,
    offsetTop: 0,
  })
  setActivePinia(createPinia())
  saved = { vaccineReminderTime: '09:00', remindBeforeDue: true }
  get.mockImplementation(async () => ({ ...saved }))
  update.mockImplementation(async (changes) => {
    saved = { ...saved, ...changes }
    return { ...saved }
  })
  provideCarnetSettingsRepository(() => ({ get, update }))
  permission.mockResolvedValue('granted')
  exact.mockResolvedValue('precise')
  vi.mocked(openExactRemindersSettings).mockResolvedValue('precise')
  router = routeurMemoire()
  await router.push({ name: 'settings' })
  await router.push({ name: 'settings-reminders' })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  provideCarnetSettingsRepository(null)
  applyLocale('fr')
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function monter(): Promise<VueWrapper> {
  wrapper = mount(RemindersSettingsView, {
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function texte(element: { text: () => string }): string {
  return element.text().replace(NBSP, ' ')
}

describe('RemindersSettingsView — état des notifications', () => {
  it('V20 : autorisées, avec l’accès aux réglages d’Android', async () => {
    const vue = await monter()

    expect(texte(vue.get('.reminders-settings__status'))).toContain('Notifications autorisées')
    expect(texte(vue.get('.reminders-settings__status'))).toContain(
      'Tes rappels arrivent normalement.',
    )
    expect(vue.find('.reminders-settings__enable').exists()).toBe(false)

    await vue.get('.reminders-settings__notification-settings').trigger('click')

    expect(openNotificationSettings).toHaveBeenCalledOnce()
  })

  it('V20 bis : désactivées, « Activer dans les réglages » ouvre les réglages d’Android', async () => {
    permission.mockResolvedValue('disabled')
    const vue = await monter()

    expect(texte(vue.get('.reminders-settings__status'))).toContain('Notifications désactivées')
    expect(texte(vue.get('.reminders-settings__status'))).toContain(
      'Tu ne reçois aucun rappel pour l’instant.',
    )
    expect(vue.find('.reminders-settings__notification-settings').exists()).toBe(false)
    const action = vue.get('.reminders-settings__enable')
    expect(texte(action)).toBe('Activer dans les réglages')

    await action.trigger('click')

    expect(openNotificationSettings).toHaveBeenCalledOnce()
  })

  it('V20 sexies : jamais demandées, « Activer les rappels » ouvre l’écran d’explication', async () => {
    permission.mockResolvedValue('unasked')
    const vue = await monter()

    expect(texte(vue.get('.reminders-settings__status'))).toContain('Rappels pas encore activés')
    expect(texte(vue.get('.reminders-settings__status'))).toContain(
      'MémoPatte n’a pas encore demandé l’autorisation d’envoyer des notifications.',
    )
    const action = vue.get('.reminders-settings__enable')
    expect(texte(action)).toBe('Activer les rappels')
    await action.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('notifications-priming'))
    expect(router.currentRoute.value.query).toEqual({ from: 'settings-reminders' })
    expect(openNotificationSettings).not.toHaveBeenCalled()
  })

  it('ne montre aucun état tant qu’Android n’a pas répondu', async () => {
    permission.mockResolvedValue('unavailable')
    const vue = await monter()

    expect(vue.find('.reminders-settings__status').exists()).toBe(false)
    expect(vue.find('.reminders-settings__exact').exists()).toBe(false)
  })
})

describe('RemindersSettingsView — rappels précis (RA-23)', () => {
  it('V20 : accordés, interrupteur allumé et encart « à l’heure pile »', async () => {
    const vue = await monter()

    const row = vue.get('.reminders-settings__exact')
    expect(texte(row)).toContain('Rappels précis')
    expect(texte(row)).toContain('Autorisés dans Android')
    expect(row.get<HTMLInputElement>('input').element.checked).toBe(true)
    expect(texte(vue.get('.reminders-settings__precise'))).toBe(
      'Autorisation Android accordée : tes rappels arrivent à l’heure pile.',
    )
    expect(vue.find('.reminders-settings__less-precise').exists()).toBe(false)
  })

  it('V20 ter : jamais activés, interrupteur éteint et la phrase qui dit à quoi ils servent', async () => {
    exact.mockResolvedValue('never-enabled')
    const vue = await monter()

    const row = vue.get('.reminders-settings__exact')
    expect(texte(row)).toContain('Pour recevoir chaque rappel à l’heure pile')
    expect(row.get<HTMLInputElement>('input').element.checked).toBe(false)
    expect(vue.find('.reminders-settings__precise').exists()).toBe(false)
  })

  it('accordés : toucher l’interrupteur ouvre directement « Alarmes et rappels » d’Android', async () => {
    const vue = await monter()

    await vue.get('.reminders-settings__exact input').trigger('click')
    await flushPromises()

    expect(openExactRemindersSettings).toHaveBeenCalledOnce()
    expect(document.body.querySelector('.exact-reminders')).toBeNull()
    expect(vue.get<HTMLInputElement>('.reminders-settings__exact input').element.checked).toBe(true)
  })

  it('V20 quater : retirés, « Moins précis » et « Réactiver » ouvre l’explication', async () => {
    exact.mockResolvedValue('removed')
    const vue = await monter()

    expect(texte(vue.get('.reminders-settings__exact'))).toContain('Désactivés dans Android')
    const notice = vue.get('.reminders-settings__less-precise')
    expect(texte(notice)).toContain('Moins précis : les rappels précis sont désactivés')

    await notice.get('button').trigger('click')
    await flushPromises()

    expect(document.body.querySelector('.exact-reminders')).not.toBeNull()
  })

  it('toucher l’interrupteur ouvre l’explication (V20 quinquies) sans rien changer seul', async () => {
    exact.mockResolvedValue('never-enabled')
    const vue = await monter()

    await vue.get('.reminders-settings__exact input').trigger('click')
    await flushPromises()

    expect(document.body.querySelector('.exact-reminders')).not.toBeNull()
    expect(openExactRemindersSettings).not.toHaveBeenCalled()
    expect(vue.get<HTMLInputElement>('.reminders-settings__exact input').element.checked).toBe(
      false,
    )
  })

  it('V20 bis : notifications coupées, l’autorisation réelle reste montrée, sans encart', async () => {
    permission.mockResolvedValue('disabled')
    const vue = await monter()

    expect(texte(vue.get('.reminders-settings__exact'))).toContain(
      'Autorisés dans Android · sans effet tant que les notifications sont coupées',
    )
    expect(vue.find('.reminders-settings__precise').exists()).toBe(false)
  })

  it('V20 sexies : notifications jamais demandées, sans effet pour l’instant', async () => {
    permission.mockResolvedValue('unasked')
    exact.mockResolvedValue('never-enabled')
    const vue = await monter()

    expect(texte(vue.get('.reminders-settings__exact'))).toContain(
      'Sans effet tant que les notifications ne sont pas activées',
    )
  })
})

describe('RemindersSettingsView — réglages du carnet', () => {
  it('montre « Me prévenir avant l’échéance » coché et 9 h par défaut', async () => {
    const vue = await monter()

    const remind = vue.get('.reminders-settings__remind-before')
    expect(texte(remind)).toContain('Me prévenir avant l’échéance')
    expect(remind.get<HTMLInputElement>('input').element.checked).toBe(true)
    expect(texte(vue.get('.reminders-settings__remind-before-hint'))).toBe(
      'Vaccins : 2 semaines avant. Traitements : 3 jours avant.',
    )
    expect(texte(vue.get('.reminders-settings__vaccine-time'))).toContain(
      'Heure des rappels de vaccins',
    )
    expect(texte(vue.get('.reminders-settings__vaccine-time .settings-row__value'))).toBe('9 h')
  })

  it('montre les réglages enregistrés', async () => {
    saved = { vaccineReminderTime: '18:30', remindBeforeDue: false }
    const vue = await monter()

    expect(
      vue.get<HTMLInputElement>('.reminders-settings__remind-before input').element.checked,
    ).toBe(false)
    expect(texte(vue.get('.reminders-settings__vaccine-time .settings-row__value'))).toBe('18 h 30')
  })

  it('écrit « Me prévenir avant l’échéance » dans les réglages du carnet', async () => {
    const vue = await monter()

    await vue.get('.reminders-settings__remind-before input').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith({ remindBeforeDue: false })
    expect(
      vue.get<HTMLInputElement>('.reminders-settings__remind-before input').element.checked,
    ).toBe(false)
  })

  it('écrit l’heure des rappels de vaccins choisie', async () => {
    const vue = await monter()

    const input = vue.get<HTMLInputElement>('.reminders-settings__vaccine-time input')
    input.element.value = '07:30'
    await input.trigger('change')
    await flushPromises()

    expect(update).toHaveBeenCalledWith({ vaccineReminderTime: '07:30' })
    expect(texte(vue.get('.reminders-settings__vaccine-time .settings-row__value'))).toBe('7 h 30')
  })

  it('ignore une heure vidée par le sélecteur', async () => {
    const vue = await monter()

    const input = vue.get<HTMLInputElement>('.reminders-settings__vaccine-time input')
    input.element.value = ''
    await input.trigger('change')
    await flushPromises()

    expect(update).not.toHaveBeenCalled()
    expect(input.element.value).toBe('09:00')
  })

  it('dit quand un réglage n’a pas pu être enregistré, et garde l’ancien', async () => {
    update.mockRejectedValueOnce(new Error('disque plein'))
    const vue = await monter()

    await vue.get('.reminders-settings__remind-before input').trigger('click')
    await flushPromises()

    expect(toastMessage.value).toBe('Le réglage n’a pas pu être enregistré. Réessaie.')
    expect(toastTone.value).toBe('error')
    expect(
      vue.get<HTMLInputElement>('.reminders-settings__remind-before input').element.checked,
    ).toBe(true)
  })

  it('propose de réessayer quand la base n’a pas répondu', async () => {
    get.mockRejectedValueOnce(new Error('base fermée'))
    const vue = await monter()

    expect(vue.find('.reminders-settings__remind-before').exists()).toBe(false)
    await vue.get('.reminders-settings__retry').trigger('click')
    await flushPromises()

    expect(vue.find('.reminders-settings__remind-before').exists()).toBe(true)
  })
})

describe('RemindersSettingsView — aide et navigation', () => {
  it('RA-24 : « Je ne reçois pas mes rappels » ouvre la section Rappels de la page Aide', async () => {
    const vue = await monter()

    const link = vue.get('a.reminders-settings__help')
    expect(texte(link)).toContain('Je ne reçois pas mes rappels')
    expect(texte(link)).toContain('Page d’aide du site')
    expect(link.attributes('href')).toBe('https://memopatte.gaelle-briet.fr/aide/#rappels')
    expect(link.attributes('target')).toBe('_blank')
  })

  it('suit la langue de l’app', async () => {
    applyLocale('en')
    const vue = await monter()

    expect(vue.get('a.reminders-settings__help').attributes('href')).toBe(
      'https://memopatte.gaelle-briet.fr/en/help/#reminders',
    )
    expect(texte(vue.get('.reminders-settings__help'))).toContain('I’m not getting my reminders')
  })

  it('revient à Paramètres', async () => {
    const vue = await monter()

    await vue.get('.pushed-screen__back').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('settings'))
  })
})
