import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DateCalendar from '../components/DateCalendar.vue'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

afterEach(() => applyLocale('fr'))

async function monter(props: Record<string, unknown>) {
  const wrapper = mount(DateCalendar, {
    props,
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function jours(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper
    .findAll('.v-date-picker-month__weekday')
    .map((jour) => jour.text())
    .filter(Boolean)
}

describe('DateCalendar', () => {
  it('suit la langue de l’app : mois en toutes lettres, semaine du lundi en une lettre', async () => {
    const wrapper = await monter({ modelValue: '2026-09-20' })

    expect(wrapper.get('.date-calendar__month').text()).toBe('septembre 2026')
    expect(jours(wrapper)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D'])
    expect(wrapper.get('.date-calendar__nav--previous').attributes('aria-label')).toBe(
      'Mois précédent',
    )
    wrapper.unmount()
  })

  it('passe en anglais avec l’app', async () => {
    applyLocale('en')
    const wrapper = await monter({ modelValue: '2026-09-20' })

    expect(wrapper.get('.date-calendar__month').text()).toBe('September 2026')
    expect(wrapper.get('.date-calendar__nav--next').attributes('aria-label')).toBe('Next month')
    wrapper.unmount()
  })

  it('rend la date choisie en date civile', async () => {
    const wrapper = await monter({ modelValue: '2026-09-20', max: '2026-09-23' })

    await wrapper
      .get('.v-date-picker-month__day .v-btn[data-v-date^="2026-09-21"]')
      .trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['2026-09-21']])
    wrapper.unmount()
  })

  it('rend inaccessibles les jours hors bornes et le mois suivant au-delà du maximum', async () => {
    const wrapper = await monter({ modelValue: '2026-09-20', min: '2026-09-10', max: '2026-09-23' })

    expect(wrapper.find('[data-v-date^="2026-09-09"]').exists()).toBe(false)
    expect(wrapper.find('[data-v-date^="2026-09-24"]').exists()).toBe(false)
    expect(wrapper.find('[data-v-date^="2026-09-23"]').exists()).toBe(true)
    expect(wrapper.get('.date-calendar__nav--next').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
