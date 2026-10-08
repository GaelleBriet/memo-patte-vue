import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import AboutSettingsView from '../views/AboutSettingsView.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { plain } from '@/shared/__tests__/plain'

let replace: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  await router.push({ name: 'settings-about' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  i18n.global.locale.value = 'fr'
  vi.restoreAllMocks()
})

async function monter() {
  wrapper = mount(AboutSettingsView, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

describe('AboutSettingsView', () => {
  it('s’intitule « À propos » et revient à la liste des Paramètres', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('À propos')
    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('affiche la version de l’app lue dans package.json', async () => {
    const wrapper = await monter()
    const version = wrapper.get('.settings-row--version')

    expect(import.meta.env.VITE_APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(version.text()).toBe(`Version${import.meta.env.VITE_APP_VERSION}`)
  })

  it.each([
    ['fr', 'Site de MémoPatte', 'Mentions légales', 'https://memopatte.app/'],
    ['en', 'MémoPatte website', 'Legal notice', 'https://memopatte.app/en/'],
  ] as const)(
    'ouvre le site et les mentions légales en %s',
    async (locale, site, mentions, url) => {
      i18n.global.locale.value = locale
      const wrapper = await monter()
      const lienSite = wrapper.get('.settings-row--website')
      const lienMentions = wrapper.get('.settings-row--legal-notice')

      expect(lienSite.get('.settings-row__label').text()).toBe(site)
      expect(lienSite.attributes('href')).toBe(url)
      expect(lienMentions.text()).toBe(mentions)
      expect(lienMentions.attributes('href')).toBe('https://gaelle-briet.fr/mentions-legales/')
      expect([lienSite, lienMentions].map((lien) => lien.attributes('target'))).toEqual([
        '_blank',
        '_blank',
      ])
      expect([lienSite, lienMentions].map((lien) => lien.attributes('rel'))).toEqual([
        'noopener',
        'noopener',
      ])
    },
  )

  it.each([
    ['fr', 'Source : ANMV, base publique des médicaments vétérinaires (CC BY)'],
    ['en', 'Source: ANMV, French public database of veterinary medicines (CC BY)'],
  ] as const)('cite la source de la liste des vaccins en %s', async (locale, source) => {
    i18n.global.locale.value = locale
    const wrapper = await monter()
    const lien = wrapper.get('.settings-row--vaccine-source')

    expect(plain(lien.text())).toBe(source)
    expect(lien.text()).toContain('(CC BY)')
    expect(lien.attributes('href')).toBe(
      'https://www.data.gouv.fr/datasets/base-de-donnees-publique-des-medicaments-veterinaires-autorises-en-france-1',
    )
    expect(lien.attributes('target')).toBe('_blank')
    expect(lien.attributes('rel')).toBe('noopener')
  })
})
