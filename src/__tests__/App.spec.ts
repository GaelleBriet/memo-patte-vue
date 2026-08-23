import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'

describe('App', () => {
  it('mounts and renders the Vuetify app shell', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [vuetify, router],
      },
    })

    expect(wrapper.find('.v-application').exists()).toBe(true)
  })
})
