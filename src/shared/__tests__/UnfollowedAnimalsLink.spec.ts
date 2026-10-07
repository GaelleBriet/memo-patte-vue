import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import UnfollowedAnimalsLink from '../components/UnfollowedAnimalsLink.vue'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

function monter(count: number) {
  return mount(UnfollowedAnimalsLink, {
    props: { count },
    global: { plugins: [vuetify, i18n] },
  })
}

describe('UnfollowedAnimalsLink', () => {
  afterEach(() => applyLocale('fr'))

  it('compte les animaux qu’on ne suit plus (AN-10)', () => {
    expect(monter(3).text()).toBe('Animaux que tu ne suis plus (3)')
  })

  it('le dit en anglais', () => {
    applyLocale('en')

    expect(monter(1).text()).toBe('Pets you no longer follow (1)')
  })

  it('demande l’ouverture au toucher', async () => {
    const wrapper = monter(2)

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)
  })
})
