import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PlusBadge from '../components/PlusBadge.vue'
import vuetify from '@/core/theme/vuetify'
import { getMsIconPath } from '@/core/theme/icons'

describe('PlusBadge', () => {
  it('porte l’icône Plus pleine, décorative pour le lecteur d’écran', () => {
    const wrapper = mount(PlusBadge, { global: { plugins: [vuetify] } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('svg path').attributes('d')).toBe(
      getMsIconPath('workspace_premium_fill')!.path,
    )
  })

  it('détoure la pastille sur une surface claire par défaut', () => {
    const wrapper = mount(PlusBadge, { global: { plugins: [vuetify] } })

    expect(wrapper.classes()).toEqual(['plus-badge', 'plus-badge--on-surface'])
  })

  it('détoure la pastille sur le pétrole d’un header', () => {
    const wrapper = mount(PlusBadge, {
      props: { on: 'primary' },
      global: { plugins: [vuetify] },
    })

    expect(wrapper.classes()).toContain('plus-badge--on-primary')
  })
})
