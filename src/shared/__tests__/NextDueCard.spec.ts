import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NextDueCard from '../components/NextDueCard.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

function monter(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(NextDueCard, {
    props: {
      label: 'Prochain rappel',
      date: '26 août 2027',
      delay: 'dans 11 mois',
      doneAriaLabel: 'C’est fait : noter l’injection de Carré pour Boree',
      ...props,
    },
    slots,
    global: { plugins: [vuetify, i18n] },
  })
}

describe('NextDueCard', () => {
  it('annonce l’échéance et son délai, puis « C’est fait » et « Modifier » (F7)', () => {
    const wrapper = monter()

    expect(wrapper.get('.next-due-card__label').text()).toBe('Prochain rappel')
    expect(wrapper.get('.next-due-card__date').text()).toBe('26 août 2027')
    expect(wrapper.get('.next-due-card__delay').text()).toBe('dans 11 mois')
    expect(wrapper.get('.next-due-card__done').text()).toBe('C’est fait')
    expect(wrapper.get('.next-due-card__done').attributes('aria-label')).toBe(
      'C’est fait : noter l’injection de Carré pour Boree',
    )
    expect(wrapper.get('.next-due-card__edit').text()).toBe('Modifier')
  })

  it('colore un retard et remplace l’échéance absente par son texte', () => {
    expect(monter({ overdue: true }).get('.next-due-card__delay').classes()).toContain(
      'next-due-card__delay--overdue',
    )
    const sans = monter({ date: null, emptyText: 'Pas de rappel programmé' })
    expect(sans.find('.next-due-card__date').exists()).toBe(false)
    expect(sans.get('.next-due-card__empty').text()).toBe('Pas de rappel programmé')
  })

  it('pose la ligne du haut quand elle est fournie', () => {
    expect(
      monter({}, { top: '<span>Tous les mois</span>' }).get('.next-due-card__top').text(),
    ).toBe('Tous les mois')
    expect(monter().find('.next-due-card__top').exists()).toBe(false)
  })

  it('émet done et edit, et se désactive pendant une écriture', async () => {
    const wrapper = monter()

    await wrapper.get('.next-due-card__done').trigger('click')
    await wrapper.get('.next-due-card__edit').trigger('click')
    await wrapper.setProps({ busy: true })

    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(wrapper.emitted('edit')).toHaveLength(1)
    expect(wrapper.get('.next-due-card__done').attributes('disabled')).toBeDefined()
  })
})
