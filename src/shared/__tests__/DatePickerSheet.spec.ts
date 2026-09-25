import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DateCalendar from '../components/DateCalendar.vue'
import DatePickerSheet from '../components/DatePickerSheet.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

function monter() {
  return mount(DatePickerSheet, {
    props: {
      modelValue: true,
      title: 'Changer la date',
      subtitle: 'Prise du 28 août 2026',
      closeLabel: 'Fermer',
      date: '2026-08-28',
      min: '2026-04-10',
      max: '2026-09-23',
      excluded: ['2026-07-28'],
    },
    global: {
      plugins: [vuetify, i18n],
      stubs: { BottomSheet: { template: '<div><slot /></div>' } },
    },
  })
}

describe('DatePickerSheet', () => {
  it('ouvre le calendrier sur la date actuelle, dans ses bornes', () => {
    expect(monter().getComponent(DateCalendar).props()).toEqual({
      modelValue: '2026-08-28',
      min: '2026-04-10',
      max: '2026-09-23',
      excluded: ['2026-07-28'],
    })
  })

  it('émet le jour touché et se ferme, sauf sur la date actuelle', async () => {
    const wrapper = monter()
    const calendrier = wrapper.getComponent(DateCalendar)

    calendrier.vm.$emit('update:modelValue', '2026-08-28')
    calendrier.vm.$emit('update:modelValue', '2026-08-25')

    expect(wrapper.emitted('pick')).toEqual([['2026-08-25']])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})
