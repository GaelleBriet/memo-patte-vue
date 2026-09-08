import { describe, it, expect, beforeEach } from 'vitest'

import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { VApp } from 'vuetify/components'

import BottomNavigation from '../BottomNavigation.vue'
import vuetify from '@/core/theme/vuetify'
import i18n from '@/core/i18n'
import router from '@/router'

// `VBottomNavigation` s'enregistre dans le layout de `VApp` : il lui faut cet hôte.
const Host = defineComponent({
  name: 'Host',
  setup: () => () => h(VApp, null, { default: () => [h(BottomNavigation)] }),
})

function mountNavigation() {
  const wrapper = mount(Host, { global: { plugins: [vuetify, i18n, router] } })

  const tabs = () => wrapper.findAll('.v-bottom-navigation .v-btn')
  const tabAt = (index: number) => {
    const tab = tabs()[index]
    if (!tab) throw new Error(`Onglet ${index} introuvable`)
    return tab
  }

  return { wrapper, tabs, tabAt }
}

describe('BottomNavigation', () => {
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

  it("marque l'onglet correspondant à la route courante", async () => {
    const { tabAt } = mountNavigation()
    await flushPromises()

    expect(tabAt(0).attributes('aria-current')).toBe('page')
    expect(tabAt(1).attributes('aria-current')).toBeUndefined()

    await router.push({ name: 'animals' })
    await flushPromises()

    expect(tabAt(0).attributes('aria-current')).toBeUndefined()
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
