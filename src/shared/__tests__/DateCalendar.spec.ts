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

  describe('mois et année au toucher du titre', () => {
    function annees(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll('.v-date-picker-years .v-btn').map((bouton) => ({
        annee: bouton.text(),
        actif: bouton.attributes('disabled') === undefined,
      }))
    }

    it('ouvre les années par un titre nommé pour le lecteur d’écran', async () => {
      const wrapper = await monter({
        modelValue: '2026-09-20',
        min: '2024-05-10',
        max: '2026-09-23',
      })

      const titre = wrapper.get('.date-calendar__month')
      expect(titre.element.tagName).toBe('BUTTON')
      expect(titre.attributes('aria-label')).toBe('Choisir le mois et l’année')
      await titre.trigger('click')

      expect(annees(wrapper)).toEqual([
        { annee: '2024', actif: true },
        { annee: '2025', actif: true },
        { annee: '2026', actif: true },
      ])
      wrapper.unmount()
    })

    it('passe de l’année aux mois, puis du mois aux jours', async () => {
      const wrapper = await monter({
        modelValue: '2026-09-20',
        min: '2024-05-10',
        max: '2026-09-23',
      })
      await wrapper.get('.date-calendar__month').trigger('click')

      await wrapper.get('.v-date-picker-years [data-v-year="2025"]').trigger('click')

      expect(wrapper.find('.v-date-picker-months').exists()).toBe(true)
      await wrapper.findAll('.v-date-picker-months .v-btn')[2]!.trigger('click')

      expect(wrapper.find('.v-date-picker-months').exists()).toBe(false)
      expect(wrapper.get('.date-calendar__month').text()).toBe('mars 2025')
      expect(wrapper.find('[data-v-date^="2025-03-15"]').exists()).toBe(true)
      wrapper.unmount()
    })

    it('garde les bornes dans la grille des mois : ni avant le minimum, ni après le maximum', async () => {
      const wrapper = await monter({
        modelValue: '2026-09-20',
        min: '2024-05-10',
        max: '2026-09-23',
      })
      await wrapper.get('.date-calendar__month').trigger('click')
      await wrapper.get('.v-date-picker-years [data-v-year="2026"]').trigger('click')

      const actifs = wrapper
        .findAll('.v-date-picker-months .v-btn')
        .map((bouton) => bouton.attributes('disabled') === undefined)
      expect(actifs).toEqual([...Array(9).fill(true), false, false, false])

      await wrapper.get('.date-calendar__month').trigger('click')
      await wrapper.get('.v-date-picker-years [data-v-year="2024"]').trigger('click')
      const debut = wrapper
        .findAll('.v-date-picker-months .v-btn')
        .map((bouton) => bouton.attributes('disabled') === undefined)
      expect(debut).toEqual([false, false, false, false, ...Array(8).fill(true)])
      wrapper.unmount()
    })

    it('referme les années sans rien choisir au second toucher du titre', async () => {
      const wrapper = await monter({ modelValue: '2026-09-20', max: '2026-09-23' })
      const titre = wrapper.get('.date-calendar__month')

      await titre.trigger('click')
      await titre.trigger('click')

      expect(wrapper.find('.v-date-picker-years').exists()).toBe(false)
      expect(wrapper.find('.v-date-picker-months').exists()).toBe(false)
      expect(wrapper.find('[data-v-date^="2026-09-20"]').exists()).toBe(true)
      wrapper.unmount()
    })
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
