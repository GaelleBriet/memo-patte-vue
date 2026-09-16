import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'

import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import vuetify from '@/core/theme/vuetify'
import i18n from '@/core/i18n'
import router, { routes } from '@/router'
import { dismissToast, showToast } from '@/shared/toast'

// Écrans bouchonnés : la coquille se teste sans charger les vues réelles ni SQLite.
const Vide = { render: () => null }

function sansEcran(route: RouteRecordRaw): RouteRecordRaw {
  if (!('component' in route)) return route

  return { path: route.path, name: route.name, meta: route.meta, component: Vide }
}

function routeurMemoire() {
  return createRouter({ history: createMemoryHistory(), routes: routes.map(sansEcran) })
}

async function monteSur(nom: string) {
  const routeur = routeurMemoire()
  await routeur.replace({ name: nom })
  const wrapper = mount(App, { global: { plugins: [vuetify, i18n, routeur] } })
  await flushPromises()

  return wrapper
}

describe('App', () => {
  it('mounts and renders the Vuetify app shell', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [vuetify, i18n, router],
      },
    })

    expect(wrapper.find('.v-application').exists()).toBe(true)
  })

  it.each(['home', 'animals'])('rend la bottom navigation sur l’écran racine %s', async (nom) => {
    const wrapper = await monteSur(nom)

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(true)
  })

  it.each(['settings', 'plus', 'animal-new', 'notifications-priming', 'analytics-consent'])(
    'masque la bottom navigation sur l’écran poussé %s',
    async (nom) => {
      const wrapper = await monteSur(nom)

      expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false)
    },
  )

  it('masque la bottom navigation dès la navigation vers un écran poussé', async () => {
    const routeur = routeurMemoire()
    await routeur.replace({ name: 'home' })
    const wrapper = mount(App, { global: { plugins: [vuetify, i18n, routeur] } })
    await flushPromises()

    await routeur.push({ name: 'settings' })
    await flushPromises()

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false)
  })

  it('héberge le toast partagé, qui survit aux changements de route', async () => {
    vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
    const wrapper = mount(App, {
      global: {
        plugins: [vuetify, i18n, router],
      },
      attachTo: document.body,
    })

    showToast('Rappels activés')
    await nextTick()

    expect(document.body.querySelector('.app-toast')?.textContent).toContain('Rappels activés')
    dismissToast()
    wrapper.unmount()
    // Le démontage de l'overlay lit encore `visualViewport` : on le laisse finir avant de retirer le stub.
    await flushPromises()
    vi.unstubAllGlobals()
  })
})
