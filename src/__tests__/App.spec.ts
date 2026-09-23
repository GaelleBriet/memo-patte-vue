import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

import { flushPromises, mount } from '@vue/test-utils'
import { VSnackbar } from 'vuetify/components'
import App from '../App.vue'
import { heightBottomNav, paddingBottomNav } from '@/core/theme/layout-tokens'
import vuetify from '@/core/theme/vuetify'
import i18n from '@/core/i18n'
import router from '@/router'
import { routeurMemoire } from '@/router/__tests__/routeur-memoire'
import { dismissToast, showToast } from '@/shared/utils/toast'

const ECRANS_RACINE = [{ name: 'home' }, { name: 'animals' }] as const

const ECRANS_POUSSES = [
  { name: 'settings' },
  { name: 'plus' },
  { name: 'animal-new' },
  { name: 'weight-history', params: { animalId: '11111111-1111-4111-8111-111111111111' } },
  { name: 'notifications-priming' },
  { name: 'analytics-consent' },
] as const

async function monteSur(cible: RouteLocationRaw) {
  const routeur = routeurMemoire()
  await routeur.replace(cible)
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

  it.each(ECRANS_RACINE)('rend la bottom navigation sur l’écran racine $name', async (cible) => {
    const wrapper = await monteSur(cible)

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(true)
  })

  it.each(ECRANS_POUSSES)('masque la bottom navigation sur l’écran poussé $name', async (cible) => {
    const wrapper = await monteSur(cible)

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false)
  })

  it('masque la bottom navigation dès la navigation vers un écran poussé', async () => {
    const routeur = routeurMemoire()
    await routeur.replace({ name: 'home' })
    const wrapper = mount(App, { global: { plugins: [vuetify, i18n, routeur] } })
    await flushPromises()

    await routeur.push({ name: 'settings' })
    await flushPromises()

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(false)
  })

  it('rend la bottom navigation au retour sur un écran racine', async () => {
    const routeur = routeurMemoire()
    await routeur.replace({ name: 'home' })
    const wrapper = mount(App, { global: { plugins: [vuetify, i18n, routeur] } })
    await routeur.push({ name: 'settings' })
    await flushPromises()

    routeur.back()
    await flushPromises()

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(true)
  })

  it.each([
    [{ name: 'home' } as const, `${heightBottomNav + paddingBottomNav}px`],
    [{ name: 'settings' } as const, '0px'],
  ])(
    'pose le toast au-dessus de la bottom navigation quand elle est là (%o)',
    async (cible, attendu) => {
      vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
      const routeur = routeurMemoire()
      await routeur.replace(cible)
      const wrapper = mount(App, {
        global: { plugins: [vuetify, i18n, routeur] },
        attachTo: document.body,
      })
      await flushPromises()

      showToast('Rappels activés')
      await flushPromises()

      const toast = wrapper.getComponent(VSnackbar).vm.rootEl
      expect(toast?.style.getPropertyValue('--v-layout-bottom')).toBe(attendu)
      dismissToast()
      wrapper.unmount()
      await flushPromises()
      vi.unstubAllGlobals()
    },
  )

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
