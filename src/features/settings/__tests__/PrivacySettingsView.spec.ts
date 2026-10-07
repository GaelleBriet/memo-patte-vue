import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import PrivacySettingsView from '../views/PrivacySettingsView.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'

const consent = vi.hoisted(() => ({ granted: false }))
const optIn = vi.hoisted(() => vi.fn<() => Promise<void>>())
const optOut = vi.hoisted(() => vi.fn<() => Promise<void>>())

vi.mock('@/core/analytics', () => ({
  hasConsent: () => consent.granted,
  optIn,
  optOut,
}))

let replace: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  consent.granted = false
  optIn.mockReset().mockImplementation(async () => void (consent.granted = true))
  optOut.mockReset().mockImplementation(async () => void (consent.granted = false))
  await router.push({ name: 'settings-privacy' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  i18n.global.locale.value = 'fr'
  vi.restoreAllMocks()
})

async function monter() {
  wrapper = mount(PrivacySettingsView, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function interrupteur(wrapper: VueWrapper) {
  return wrapper.get<HTMLInputElement>('.settings-row--analytics input[type="checkbox"]')
}

describe('PrivacySettingsView', () => {
  it('s’intitule « Confidentialité » et revient à la liste des Paramètres', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Confidentialité')
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('nomme l’interrupteur « Statistiques d’usage », jamais « anonymes »', async () => {
    const wrapper = await monter()
    const input = interrupteur(wrapper)

    expect(wrapper.get('.settings-row--analytics').text()).toContain('Statistiques d’usage')
    expect(wrapper.text()).not.toMatch(/anonyme/i)
    expect([...input.element.labels!].map((label) => label.textContent?.trim())).toContain(
      'Statistiques d’usage',
    )
  })

  it('annonce l’interrupteur comme un interrupteur aux lecteurs d’écran', async () => {
    const wrapper = await monter()

    expect(interrupteur(wrapper).attributes('role')).toBe('switch')
  })

  it('ne pose aucun voile sous le doigt pendant l’appui', async () => {
    const wrapper = await monter()
    const zone = wrapper.get('.settings-row--analytics .v-selection-control__input')

    await zone.trigger('mousedown')

    expect(zone.find('.v-ripple__container').exists()).toBe(false)
  })

  it.each([false, true])('reflète le consentement enregistré (%s)', async (granted) => {
    consent.granted = granted
    const wrapper = await monter()

    expect(interrupteur(wrapper).element.checked).toBe(granted)
  })

  it('active les statistiques dès que l’interrupteur passe à oui', async () => {
    const wrapper = await monter()

    await interrupteur(wrapper).setValue(true)

    expect(optIn).toHaveBeenCalledOnce()
    expect(optOut).not.toHaveBeenCalled()
    expect(interrupteur(wrapper).element.checked).toBe(true)
  })

  it('bascule aussi d’un tap sur le libellé, toute la ligne servant de zone de tap', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--analytics .settings-row__label').trigger('click')

    expect(optIn).toHaveBeenCalledOnce()
    expect(interrupteur(wrapper).element.checked).toBe(true)
  })

  it('les coupe dès que l’interrupteur passe à non', async () => {
    consent.granted = true
    const wrapper = await monter()

    await interrupteur(wrapper).setValue(false)

    expect(optOut).toHaveBeenCalledOnce()
    expect(optIn).not.toHaveBeenCalled()
    expect(interrupteur(wrapper).element.checked).toBe(false)
  })

  it.each([
    ['fr', 'Politique de confidentialité', 'https://memopatte.gaelle-briet.fr/confidentialite/'],
    ['en', 'Privacy policy', 'https://memopatte.gaelle-briet.fr/en/privacy/'],
  ] as const)('ouvre la politique de confidentialité du site en %s', async (locale, label, url) => {
    i18n.global.locale.value = locale
    const wrapper = await monter()
    const lien = wrapper.get('.settings-row--privacy-policy')

    expect(lien.get('.settings-row__label').text()).toBe(label)
    expect(lien.attributes('href')).toBe(url)
    expect(lien.attributes('target')).toBe('_blank')
  })
})
