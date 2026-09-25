import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HistoryRow from '../components/HistoryRow.vue'
import OverflowMenu from '../components/OverflowMenu.vue'
import vuetify from '@/core/theme/vuetify'

const ITEMS = [{ id: 'changeDate', label: 'Changer la date', icon: 'ms:edit_calendar' }]

function monter(props: Record<string, unknown> = {}) {
  return mount(HistoryRow, {
    props: {
      date: '28 août 2026',
      optionsLabel: 'Options pour la prise du 28 août 2026',
      items: ITEMS,
      ...props,
    },
    global: { plugins: [vuetify] },
  })
}

describe('HistoryRow', () => {
  it('écrit la date, la pastille et le détail quand ils sont donnés (F8)', () => {
    const wrapper = monter({ badge: 'Dernière prise', detail: 'A fixé la dose du 28 sept.' })

    expect(wrapper.get('.history-row__date').text()).toBe('28 août 2026')
    expect(wrapper.get('.history-row__badge').text()).toBe('Dernière prise')
    expect(wrapper.get('.history-row__detail').text()).toBe('A fixé la dose du 28 sept.')
  })

  it('écrit la date en gras, en poids normal sur demande', () => {
    expect(monter().get('.history-row__date').classes()).not.toContain('history-row__date--regular')
    expect(monter({ regular: true }).get('.history-row__date').classes()).toContain(
      'history-row__date--regular',
    )
  })

  it('se réduit à la date sans pastille ni détail', () => {
    const wrapper = monter()

    expect(wrapper.find('.history-row__badge').exists()).toBe(false)
    expect(wrapper.find('.history-row__detail').exists()).toBe(false)
  })

  it('passe son menu et relaie l’action choisie', () => {
    const wrapper = monter()
    const menu = wrapper.getComponent(OverflowMenu)

    menu.vm.$emit('select', 'changeDate')

    expect(menu.props()).toEqual({
      label: 'Options pour la prise du 28 août 2026',
      items: ITEMS,
    })
    expect(wrapper.emitted('select')).toEqual([['changeDate']])
  })
})
