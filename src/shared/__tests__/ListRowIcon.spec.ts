import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ListRowIcon from '../components/ListRowIcon.vue'
import vuetify from '@/core/theme/vuetify'

function monter(props: { icon: string; muted?: boolean }) {
  return mount(ListRowIcon, { props, global: { plugins: [vuetify] } })
}

describe('ListRowIcon', () => {
  it('pose l’icône reçue dans une pastille cachée des lecteurs d’écran', () => {
    const wrapper = monter({ icon: 'ms:vaccines' })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.text()).toBe('')
    expect(wrapper.findComponent({ name: 'VIcon' }).props('icon')).toBe('ms:vaccines')
  })

  it('passe en gris pour une ligne discrète', () => {
    expect(monter({ icon: 'ms:medication' }).classes()).not.toContain('list-row-icon--muted')
    expect(monter({ icon: 'ms:medication', muted: true }).classes()).toContain(
      'list-row-icon--muted',
    )
  })
})
