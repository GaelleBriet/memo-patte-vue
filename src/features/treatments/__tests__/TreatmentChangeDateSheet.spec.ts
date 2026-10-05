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
