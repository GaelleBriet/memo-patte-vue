import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import AnalyticsConsentView from '../AnalyticsConsentView.vue'
import { optIn, optOut } from '@/core/analytics'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

vi.mock('@/core/analytics', () => ({
  optIn: vi.fn<() => Promise<void>>(async () => {}),
  optOut: vi.fn<() => Promise<void>>(async () => {}),
}))

const Vide = { render: () => null }
let routeur: Router
let replace: MockInstance

beforeEach(async () => {
  routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Vide },
      { path: '/analytics/consent', name: 'analytics-consent', component: Vide },
    ],
  })
  await routeur.push('/analytics/consent')
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
})

afterEach(() => {
  vi.mocked(optIn).mockClear()
  vi.mocked(optOut).mockClear()
})

function monter() {
  return mount(AnalyticsConsentView, { global: { plugins: [vuetify, i18n, routeur] } })
}

describe('AnalyticsConsentView', () => {
  it('explique ce qui est mesuré, ce qui ne l’est jamais, et où changer d’avis', () => {
    const wrapper = monter()

    expect(wrapper.get('h1').text()).toBe('Avant de commencer')
    expect(wrapper.findAll('p').map((paragraph) => paragraph.text())).toEqual([
      'Avec ton accord, MémoPatte mesure des statistiques d’usage anonymes pour améliorer l’app : les écrans consultés et des actions comme « vaccin ajouté ».',
      'Jamais le contenu de ton carnet, jamais le nom de tes animaux. Ces données sont hébergées en Europe.',
      'Tu peux changer d’avis à tout moment dans Paramètres → Confidentialité.',
    ])
  })

  it('propose Refuser et Accepter côte à côte, du même style', () => {
    const wrapper = monter()
    const boutons = wrapper.findAll('.analytics-consent__actions .v-btn')

    expect(boutons.map((bouton) => bouton.text())).toEqual(['Refuser', 'Accepter'])
    const styles = boutons.map((bouton) =>
      bouton
        .classes()
        .filter((classe) => classe.startsWith('v-btn--') || classe.startsWith('text-'))
        .sort(),
    )
    expect(styles[0]).toEqual(styles[1])
    expect(styles[0]).toContain('v-btn--variant-outlined')
    expect(boutons.map((bouton) => bouton.classes())).toEqual([
      expect.arrayContaining(['analytics-consent__choice']),
      expect.arrayContaining(['analytics-consent__choice']),
    ])
  })

  it('n’active rien avant une réponse', () => {
    monter()

    expect(optIn).not.toHaveBeenCalled()
    expect(optOut).not.toHaveBeenCalled()
  })

  it('Accepter active les statistiques puis ouvre l’accueil', async () => {
    const wrapper = monter()

    await wrapper.get('.analytics-consent__accept').trigger('click')

    expect(optIn).toHaveBeenCalledTimes(1)
    expect(optOut).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'home' })
  })

  it('Refuser enregistre le refus puis ouvre l’accueil', async () => {
    const wrapper = monter()

    await wrapper.get('.analytics-consent__refuse').trigger('click')

    expect(optOut).toHaveBeenCalledTimes(1)
    expect(optIn).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'home' })
  })
})
