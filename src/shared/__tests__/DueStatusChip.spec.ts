import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DueStatusChip from '../DueStatusChip.vue'
import vuetify from '@/core/theme/vuetify'

type Props = InstanceType<typeof DueStatusChip>['$props']

function monter(props: Props) {
  return mount(DueStatusChip, { props, global: { plugins: [vuetify] } })
}

describe('DueStatusChip', () => {
  it('affiche le libellé et porte la variante de son statut', () => {
    const wrapper = monter({ status: 'overdue', label: 'En retard · 2 j' })

    expect(wrapper.text()).toBe('En retard · 2 j')
    expect(wrapper.classes()).toEqual(['due-status-chip', 'due-status-chip--overdue'])
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('affiche l’icône fournie devant le libellé', () => {
    const wrapper = monter({ status: 'up-to-date', label: 'À jour', icon: 'ms:check' })

    expect(wrapper.classes()).toContain('due-status-chip--up-to-date')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it.each(['today', 'tomorrow', 'later', 'none'] as const)('accepte le statut %s', (status) => {
    expect(monter({ status, label: 'x' }).classes()).toContain(`due-status-chip--${status}`)
  })
})
