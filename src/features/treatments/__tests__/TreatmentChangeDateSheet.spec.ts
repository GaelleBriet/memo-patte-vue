import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DateChangeBox } from '../logic/treatment-shift-box'
import TreatmentChangeDateSheet from '../views/TreatmentChangeDateSheet.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import DateCalendar from '@/shared/components/DateCalendar.vue'

beforeEach(() => {
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

// Report du 16 oct. au 19, sans décalage : la case se rouvre décochée (N2).
const BOX: DateChangeBox = {
  initial: false,
  aloneMax: '2026-10-22',
  refusedDays: () => [],
  view: (date, shifts) =>
    date === '2026-10-24' && !shifts
      ? { shown: true, help: { text: 'Seule, au plus tard le 22.', warning: true }, blocked: true }
      : { shown: true, help: { text: shifts ? 'Décalées.' : 'Seule.', warning: false } },
}

async function ouvrir() {
  const wrapper = mount(TreatmentChangeDateSheet, {
    props: { modelValue: false, subtitle: 'Reportée au 19 oct.', date: '2026-10-19', box: BOX },
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

function dansLaFeuille<T extends HTMLElement = HTMLElement>(selector: string): T[] {
  return [...document.body.querySelectorAll<T>(selector)]
}

describe('TreatmentChangeDateSheet — « Changer la date » avec la case (V30)', () => {
  it('rouvre la case telle qu’elle a été laissée, et n’enregistre qu’une autre date', async () => {
    const wrapper = await ouvrir()
    const [caseDecaler] = dansLaFeuille<HTMLInputElement>('.treatment-shift__input')
    const [enregistrer] = dansLaFeuille<HTMLButtonElement>('.treatment-change-date__save')

    expect(caseDecaler!.checked).toBe(false)
    expect(enregistrer!.disabled).toBe(true)

    wrapper.getComponent(DateCalendar).vm.$emit('update:modelValue', '2026-10-20')
    await flushPromises()
    expect(dansLaFeuille('.treatment-shift__help')[0]!.textContent).toBe('Seule.')
    enregistrer!.click()
    await flushPromises()

    expect(wrapper.emitted('save')).toEqual([['2026-10-20', false]])
    wrapper.unmount()
  })

  it('refuse un report seul au-delà de la veille de la dose suivante (Q2 a)', async () => {
    const wrapper = await ouvrir()

    wrapper.getComponent(DateCalendar).vm.$emit('update:modelValue', '2026-10-24')
    await flushPromises()

    expect(dansLaFeuille('.treatment-shift__help--warning')[0]!.textContent).toBe(
      'Seule, au plus tard le 22.',
    )
    expect(dansLaFeuille<HTMLButtonElement>('.treatment-change-date__save')[0]!.disabled).toBe(true)

    dansLaFeuille<HTMLInputElement>('.treatment-shift__input')[0]!.click()
    await flushPromises()
    expect(dansLaFeuille<HTMLButtonElement>('.treatment-change-date__save')[0]!.disabled).toBe(
      false,
    )
    wrapper.unmount()
  })
})

describe('TreatmentChangeDateSheet — aide sous le calendrier (Q30)', () => {
  it('dit à partir de quel jour la prise peut être datée', async () => {
    const wrapper = mount(TreatmentChangeDateSheet, {
      props: {
        modelValue: false,
        subtitle: 'Prise du 23 oct. 2026',
        date: '2026-10-23',
        min: '2026-10-23',
        max: '2026-10-24',
        hint: 'Choisis une date à partir du 23 oct.',
      },
      global: { plugins: [vuetify, i18n], stubs: { transition: false } },
      attachTo: document.body,
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(dansLaFeuille('.treatment-change-date__hint')[0]!.textContent).toBe(
      'Choisis une date à partir du 23 oct.',
    )
    wrapper.unmount()
  })
})

describe('TreatmentChangeDateSheet — « Cette prise » d’une prise en plus (Q37)', () => {
  const question = (date: string | null, answer: string | null) =>
    date === '2026-10-17'
      ? {
          title: 'Cette prise',
          options: [
            { value: 'extra' as const, label: 'En plus' },
            { value: 'replaces' as const, label: 'Remplace celle du 23 oct.' },
          ] as [{ value: 'extra'; label: string }, { value: 'replaces'; label: string }],
          help: answer === null ? null : `Réponse : ${answer}`,
        }
      : null

  it('pose la question, « Enregistrer » grisé sans réponse, puis enregistre la réponse', async () => {
    const wrapper = mount(TreatmentChangeDateSheet, {
      props: {
        modelValue: false,
        subtitle: 'Prise en plus du 16 oct. 2026',
        date: '2026-10-16',
        max: '2026-10-17',
        question,
      },
      global: { plugins: [vuetify, i18n], stubs: { transition: false } },
      attachTo: document.body,
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(dansLaFeuille('.treatment-extra-question')).toHaveLength(0)

    wrapper.getComponent(DateCalendar).vm.$emit('update:modelValue', '2026-10-17')
    await flushPromises()
    const options = dansLaFeuille<HTMLButtonElement>('.form-segmented__option')
    const [enregistrer] = dansLaFeuille<HTMLButtonElement>('.treatment-change-date__save')

    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'En plus',
      'Remplace celle du 23 oct.',
    ])
    expect(enregistrer!.disabled).toBe(true)

    options[0]!.click()
    await flushPromises()
    expect(enregistrer!.disabled).toBe(false)
    enregistrer!.click()
    await flushPromises()

    expect(wrapper.emitted('save')).toEqual([['2026-10-17', true, 'extra']])
    wrapper.unmount()
  })
})
