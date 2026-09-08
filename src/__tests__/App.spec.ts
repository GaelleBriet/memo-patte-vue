import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'
import vuetify from '@/core/theme/vuetify'
import i18n from '@/core/i18n'
import router from '@/router'

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
})
