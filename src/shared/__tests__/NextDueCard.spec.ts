import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NextDueCard from '../components/NextDueCard.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

function monter(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(NextDueCard, {
    props: {
      label: 'Prochain rappel',
      value: '26 août 2027',
      delay: 'dans 11 mois',
      doneAriaLabel: 'C’est fait : noter l’injection de Carré pour Boree',
      ...props,
    },
    slots,
    global: { plugins: [vuetify, i18n] },
  })
}

describe('NextDueCard', () => {
  it('annonce l’échéance et son délai, puis « C’est fait » et « Fait à une autre date » (VA-17)', () => {
    const wrapper = monter()

    expect(wrapper.get('.next-due-card__label').text()).toBe('Prochain rappel')
    expect(wrapper.get('.next-due-card__value').text()).toBe('26 août 2027')
    expect(wrapper.get('.next-due-card__delay').text()).toBe('dans 11 mois')
    expect(wrapper.get('.next-due-card__done').text()).toBe('C’est fait')
    expect(wrapper.get('.next-due-card__done').attributes('aria-label')).toBe(
      'C’est fait : noter l’injection de Carré pour Boree',
    )
    expect(wrapper.get('.next-due-card__other-date').text()).toBe('Fait à une autre date')
    expect(wrapper.find('.next-due-card__edit').exists()).toBe(false)
  })

  it('colore le jour même en ambre et un retard en rouge, sans délai', () => {
    const jour = monter({ value: 'Aujourd’hui', delay: null, tone: 'today' })
    expect(jour.get('.next-due-card__value').classes()).toContain('next-due-card__value--today')
    expect(jour.find('.next-due-card__delay').exists()).toBe(false)

    const retard = monter({ value: 'En retard depuis le 5 oct.', delay: null, tone: 'overdue' })
    expect(retard.get('.next-due-card__value').classes()).toContain('next-due-card__value--overdue')
  })

  it('remplace l’échéance absente par son texte', () => {
    const sans = monter({ value: null, emptyText: 'Pas de rappel programmé' })
    expect(sans.find('.next-due-card__value').exists()).toBe(false)
    expect(sans.get('.next-due-card__empty').text()).toBe('Pas de rappel programmé')
  })

  it('pose la ligne du haut quand elle est fournie', () => {
    expect(
      monter({}, { top: '<span>Premier vaccin</span>' }).get('.next-due-card__top').text(),
    ).toBe('Premier vaccin')
    expect(monter().find('.next-due-card__top').exists()).toBe(false)
  })

  it('émet done et otherDate, et se désactive pendant une écriture', async () => {
    const wrapper = monter()

    await wrapper.get('.next-due-card__done').trigger('click')
    await wrapper.get('.next-due-card__other-date').trigger('click')
    await wrapper.setProps({ busy: true })

    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(wrapper.emitted('otherDate')).toHaveLength(1)
    expect(wrapper.get('.next-due-card__done').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.next-due-card__other-date').attributes('disabled')).toBeDefined()
  })
})
