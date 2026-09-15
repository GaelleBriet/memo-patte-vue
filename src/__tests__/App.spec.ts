import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'

import { mount } from '@vue/test-utils'
import App from '../App.vue'
import vuetify from '@/core/theme/vuetify'
import i18n from '@/core/i18n'
import router from '@/router'
import { dismissToast, showToast } from '@/shared/toast'

describe('App', () => {
  it('mounts and renders the Vuetify app shell', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [vuetify, i18n, router],
      },
    })

    expect(wrapper.find('.v-application').exists()).toBe(true)
  })

  it('rend la bottom navigation sur toutes les vues', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [vuetify, i18n, router],
      },
    })

    expect(wrapper.find('.v-bottom-navigation').exists()).toBe(true)
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
    vi.unstubAllGlobals()
  })
})
