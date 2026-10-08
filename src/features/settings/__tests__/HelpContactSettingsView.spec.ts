import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import HelpContactSettingsView from '../views/HelpContactSettingsView.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { dismissToast, toastMessage, toastTone } from '@/shared/utils/toast'

const system = vi.hoisted(() => ({
  androidVersion: vi.fn<() => Promise<string | null>>(),
  openInExternalApp: vi.fn<(url: string) => Promise<boolean>>(),
}))

const analytics = vi.hoisted(() => ({ track: vi.fn<(event: string) => void>() }))

vi.mock('@/core/device/system-apps', () => system)
vi.mock('@/core/analytics', () => ({ track: analytics.track }))

const VERSION = import.meta.env.VITE_APP_VERSION

let replace: MockInstance
let writeText: MockInstance<(text: string) => Promise<void>>
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  system.androidVersion.mockResolvedValue('16')
  system.openInExternalApp.mockResolvedValue(true)
  writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
  dismissToast()
  await router.push({ name: 'settings-help' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  i18n.global.locale.value = 'fr'
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function monter() {
  wrapper = mount(HelpContactSettingsView, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function lienOuvert(): URL {
  const url = system.openInExternalApp.mock.calls.at(-1)?.[0]
  expect(url).toBeDefined()
  return new URL(url!)
}

function feuille() {
  return document.querySelector('.help-contact__no-mail-app')
}

describe('HelpContactSettingsView', () => {
  it('s’intitule « Aide et contact » et revient à la liste des Paramètres', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Aide et contact')
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it.each([
    ['fr', 'https://memopatte.app/aide/', 'Page d’aide', 'Questions fréquentes, sur le site'],
    ['en', 'https://memopatte.app/en/help/', 'Help page', 'FAQ, on the website'],
  ] as const)('ouvre la page d’aide du site en %s', async (locale, url, label, hint) => {
    i18n.global.locale.value = locale
    const wrapper = await monter()
    const lien = wrapper.get('.settings-row--help-page')

    expect(lien.get('.settings-row__label').text()).toBe(label)
    expect(lien.get('.settings-row__hint').text()).toBe(hint)
    expect(lien.attributes('href')).toBe(url)
    expect(lien.attributes('target')).toBe('_blank')
  })

  it('montre les deux façons d’écrire et ce que contient le message (V27 bis)', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.settings-row--write').text()).toBe('Nous écrireOuvre un e-mail prérempli')
    expect(wrapper.get('.settings-row--suggest').text()).toBe(
      'Il me manque quelque choseSuggère une fonction',
    )
    expect(wrapper.get('.help-contact__mail-content').text()).toBe(
      'Le message prérempli contient la version de l’app et d’Android, jamais le contenu de ton carnet.',
    )
  })

  it('« Nous écrire » ouvre un e-mail prérempli : objet « question », versions de l’app et d’Android', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--write').trigger('click')
    await flushPromises()
    const url = lienOuvert()

    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('contact@memopatte.app')
    expect(url.searchParams.get('subject')).toBe('MémoPatte : question')
    expect(url.searchParams.get('body')).toBe(
      `\r\n\r\n\r\nVersion de l’app : ${VERSION}\r\nVersion d’Android : 16`,
    )
  })

  it('« Il me manque quelque chose » ouvre un e-mail à la même adresse, objet « suggestion »', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--suggest').trigger('click')
    await flushPromises()
    const url = lienOuvert()

    expect(url.pathname).toBe('contact@memopatte.app')
    expect(url.searchParams.get('subject')).toBe('MémoPatte : suggestion')
  })

  it('écrit l’e-mail en anglais quand l’app est en anglais', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monter()

    await wrapper.get('.settings-row--suggest').trigger('click')
    await flushPromises()
    const url = lienOuvert()

    expect(url.searchParams.get('subject')).toBe('MémoPatte: suggestion')
    expect(url.searchParams.get('body')).toBe(
      `\r\n\r\n\r\nApp version: ${VERSION}\r\nAndroid version: 16`,
    )
  })

  it('sans version d’Android connue, ne donne que celle de l’app', async () => {
    system.androidVersion.mockResolvedValue(null)
    const wrapper = await monter()

    await wrapper.get('.settings-row--write').trigger('click')
    await flushPromises()

    expect(lienOuvert().searchParams.get('body')).toBe(`\r\n\r\n\r\nVersion de l’app : ${VERSION}`)
  })

  it('n’envoie aucun événement de statistiques en ouvrant un e-mail', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--write').trigger('click')
    await wrapper.get('.settings-row--suggest').trigger('click')
    await flushPromises()

    expect(analytics.track).not.toHaveBeenCalled()
  })

  it('ne montre pas l’adresse à copier quand l’app de messagerie s’ouvre', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--write').trigger('click')
    await flushPromises()

    expect(feuille()).toBeNull()
  })

  describe('sans app de messagerie (V27 ter)', () => {
    beforeEach(() => {
      system.openInExternalApp.mockResolvedValue(false)
    })

    it('affiche l’adresse avec « Copier »', async () => {
      const wrapper = await monter()

      await wrapper.get('.settings-row--write').trigger('click')
      await flushPromises()

      expect(feuille()?.textContent).toContain(
        'Aucune app de messagerie n’est installée. Écris-nous à cette adresse :',
      )
      expect(document.querySelector('.help-contact__address')?.textContent?.trim()).toBe(
        'contact@memopatte.app',
      )
      expect(document.querySelector('.bottom-sheet__title')?.textContent).toBe('Nous écrire')
      expect(document.querySelector('.help-contact__copy')?.textContent?.trim()).toBe('Copier')
    })

    it('titre la feuille d’après la ligne touchée', async () => {
      const wrapper = await monter()

      await wrapper.get('.settings-row--suggest').trigger('click')
      await flushPromises()

      expect(document.querySelector('.bottom-sheet__title')?.textContent).toBe(
        'Il me manque quelque chose',
      )
    })

    it('« Copier » copie l’adresse et le confirme par un toast', async () => {
      const wrapper = await monter()
      await wrapper.get('.settings-row--write').trigger('click')
      await flushPromises()

      document.querySelector<HTMLButtonElement>('.help-contact__copy')!.click()
      await flushPromises()

      expect(writeText).toHaveBeenCalledWith('contact@memopatte.app')
      expect(toastMessage.value).toBe('Adresse copiée')
      expect(toastTone.value).toBe('success')
    })

    it('dit quand l’adresse n’a pas pu être copiée', async () => {
      writeText.mockRejectedValue(new Error('refusé'))
      const wrapper = await monter()
      await wrapper.get('.settings-row--write').trigger('click')
      await flushPromises()

      document.querySelector<HTMLButtonElement>('.help-contact__copy')!.click()
      await flushPromises()

      expect(toastMessage.value).toBe('L’adresse n’a pas pu être copiée.')
      expect(toastTone.value).toBe('error')
    })

    it('se lit en anglais', async () => {
      i18n.global.locale.value = 'en'
      const wrapper = await monter()

      await wrapper.get('.settings-row--write').trigger('click')
      await flushPromises()

      expect(feuille()?.textContent).toContain(
        'No email app is installed. Write to us at this address:',
      )
      expect(document.querySelector('.help-contact__copy')?.textContent?.trim()).toBe('Copy')
    })
  })
})
