import { describe, it, expect, beforeEach } from 'vitest'

import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VApp } from 'vuetify/components'

import BottomNavigation from '../BottomNavigation.vue'
import vuetify from '@/core/theme/vuetify'
import i18n from '@/core/i18n'
import appRouter from '@/router'

// Routeur de test : la barre ne dépend que des noms de route. Le vrai routeur charge
// l'écran Carnet à la navigation, donc tout SQLite, et le test expirait sous charge.
const Empty = { render: () => null }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: Empty },
    { path: '/animals', name: 'animals', component: Empty },
  ],
})

// `VBottomNavigation` s'enregistre dans le layout de `VApp` : il lui faut cet hôte.
const Host = defineComponent({
  name: 'Host',
  setup: () => () => h(VApp, null, { default: () => [h(BottomNavigation)] }),
})

function mountNavigation() {
  const wrapper = mount(Host, { global: { plugins: [vuetify, i18n, router] } })

  const nav = () => wrapper.get('.v-bottom-navigation')
  const tabs = () => wrapper.findAll('.v-bottom-navigation .v-btn')
  const tabAt = (index: number) => {
    const tab = tabs()[index]
    if (!tab) throw new Error(`Onglet ${index} introuvable`)
    return tab
  }

  return { wrapper, nav, tabs, tabAt }
}

describe('BottomNavigation', () => {
  it("cible des routes qui existent dans le routeur de l'app", () => {
    expect(appRouter.hasRoute('home')).toBe(true)
    expect(appRouter.hasRoute('animals')).toBe(true)
  })

  beforeEach(async () => {
    await router.replace('/')
    await router.isReady()
  })

  it('affiche exactement deux onglets, icône et libellé', () => {
    const { tabs } = mountNavigation()

    expect(tabs()).toHaveLength(2)
    expect(tabs().map((tab) => tab.text())).toEqual(['Accueil', 'Carnet'])
    expect(tabs().map((tab) => tab.find('svg').exists())).toEqual([true, true])
  })

  it("n'expose aucun onglet Documents ou Finances", () => {
    const { wrapper } = mountNavigation()

    expect(wrapper.text()).not.toContain('Documents')
    expect(wrapper.text()).not.toContain('Finances')
  })

  it("pose une barre pleine largeur et claire sur le bas de l'écran", () => {
    const { nav } = mountNavigation()

    expect(nav().element.tagName).toBe('NAV')
    expect(nav().classes()).toContain('bg-surface')
    expect(nav().classes()).toContain('v-bottom-navigation--grow')
    expect(nav().classes()).toContain('elevation-0')
  })

  it('réserve la zone de gestes Android sous les onglets', () => {
    const { nav } = mountNavigation()

    // 56 px d'onglets plus les 22 px de `$padding-bottom-nav`.
    expect(nav().attributes('style')).toContain('height: 78px')
  })

  it("marque l'onglet correspondant à la route courante", async () => {
    const { tabAt } = mountNavigation()
    await flushPromises()

    // Le gris chaud de l'onglet inactif vient du style scopé, hors de portée de
    // jsdom : on vérifie seulement qu'il ne prend pas le pétrole.
    expect(tabAt(0).classes()).toContain('v-btn--selected')
    expect(tabAt(0).classes()).toContain('text-primary')
    expect(tabAt(0).attributes('aria-current')).toBe('page')
    expect(tabAt(1).classes()).not.toContain('v-btn--selected')
    expect(tabAt(1).classes()).not.toContain('text-primary')
    expect(tabAt(1).attributes('aria-current')).toBeUndefined()

    await router.push({ name: 'animals' })
    await flushPromises()

    expect(tabAt(0).classes()).not.toContain('v-btn--selected')
    expect(tabAt(0).classes()).not.toContain('text-primary')
    expect(tabAt(0).attributes('aria-current')).toBeUndefined()
    expect(tabAt(1).classes()).toContain('v-btn--selected')
    expect(tabAt(1).classes()).toContain('text-primary')
    expect(tabAt(1).attributes('aria-current')).toBe('page')
  })

  it("navigue vers le Carnet au clic sur l'onglet Carnet", async () => {
    const { tabAt } = mountNavigation()
    await flushPromises()

    await tabAt(1).trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('animals')
  })
})
