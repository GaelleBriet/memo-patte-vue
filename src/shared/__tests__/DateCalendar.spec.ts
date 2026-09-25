import { App, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import DateCalendar from '../components/DateCalendar.vue'
import { installBackButton, onBackButton } from '@/core/app-lifecycle/back-button'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

type BackListener = (event: BackButtonListenerEvent) => void

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn<(event: string, callback: BackListener) => Promise<PluginListenerHandle>>(
      async () => ({ remove: async () => {} }),
    ),
    minimizeApp: vi.fn<() => Promise<void>>(async () => {}),
  },
}))

afterEach(() => {
  applyLocale('fr')
  vi.restoreAllMocks()
})

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
    expect(wrapper.get('.date-calendar__month').attributes('aria-label')).toBe(
      'September 2026, choose the month and year',
    )
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

  it('rend non sélectionnables les jours exclus, dans les bornes', async () => {
    const wrapper = await monter({
      modelValue: '2026-09-20',
      max: '2026-09-23',
      excluded: ['2026-09-18'],
    })

    const actif = (jour: string) =>
      wrapper
        .get(`.v-date-picker-month__day .v-btn[aria-label$="${jour}"]`)
        .attributes('disabled') === undefined
    expect(actif(' 18 septembre 2026')).toBe(false)
    expect(actif(' 19 septembre 2026')).toBe(true)
    expect(actif(' 24 septembre 2026')).toBe(false)
    wrapper.unmount()
  })

  describe('mois et année au toucher du titre', () => {
    function annees(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll('.v-date-picker-years .v-btn').map((bouton) => ({
        annee: bouton.text(),
        actif: bouton.attributes('disabled') === undefined,
      }))
    }

    it('ouvre les années par un titre dont le nom commence par le mois affiché', async () => {
      const wrapper = await monter({
        modelValue: '2026-09-20',
        min: '2024-05-10',
        max: '2026-09-23',
      })

      const titre = wrapper.get('.date-calendar__month')
      expect(titre.element.tagName).toBe('BUTTON')
      expect(titre.attributes('aria-label')).toBe('septembre 2026, choisir le mois et l’année')
      await wrapper.get('.date-calendar__nav--previous').trigger('click')
      expect(titre.attributes('aria-label')).toBe('août 2026, choisir le mois et l’année')
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

    it('revient aux jours au retour Android, avant l’écran qui porte le calendrier', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
      const desinstaller = installBackButton()
      const retour = (vi.mocked(App.addListener) as Mock).mock.calls.at(-1)![1] as BackListener
      const ecran = vi.fn<() => void>()
      const libererEcran = onBackButton(ecran)
      const wrapper = await monter({
        modelValue: '2026-09-20',
        min: '2024-05-10',
        max: '2026-09-23',
      })

      await wrapper.get('.date-calendar__month').trigger('click')
      retour({ canGoBack: true })
      await flushPromises()
      expect(wrapper.find('.v-date-picker-years').exists()).toBe(false)
      expect(wrapper.find('[data-v-date^="2026-09-20"]').exists()).toBe(true)

      await wrapper.get('.date-calendar__month').trigger('click')
      await wrapper.get('.v-date-picker-years [data-v-year="2025"]').trigger('click')
      retour({ canGoBack: true })
      await flushPromises()
      expect(wrapper.find('.v-date-picker-months').exists()).toBe(false)
      expect(wrapper.find('.v-date-picker-month').exists()).toBe(true)
      expect(ecran).not.toHaveBeenCalled()

      retour({ canGoBack: true })
      expect(ecran).toHaveBeenCalledOnce()
      libererEcran()
      desinstaller()
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
