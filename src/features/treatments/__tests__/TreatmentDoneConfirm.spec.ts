import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dose, period, plain, treatment } from './treatment-fixtures'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'
import TreatmentDoneConfirm from '../views/TreatmentDoneConfirm.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

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

// Pixel, vermifuge tous les vendredis ; la dose du 16 oct. est en retard le lundi 19.
const VENDREDI = period({
  startsOn: '2026-10-09',
  firstDueOn: '2026-10-09',
  frequency: { value: 1, unit: 'week' },
})
const DUE_16 = { periodId: 'p-1', dueOn: '2026-10-16', dueTime: null }
const TODAY = '2026-10-19'

async function ouvrir(endsOn: string | null = null) {
  const history = treatment([{ ...VENDREDI, endsOn }], [dose('2026-10-09', '2026-10-16')])
  const wrapper = mount(TreatmentDoneConfirm, {
    props: {
      modelValue: false,
      name: 'Milbemax',
      animal: 'Pixel',
      icon: 'ms:medication',
      history,
      schedule: treatmentScheduleOf(history, TODAY),
      today: TODAY,
      due: DUE_16,
    },
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

function texte(selector: string): string {
  return plain(dansLaFeuille(selector)[0]?.textContent ?? '').trim()
}

describe('TreatmentDoneConfirm — « C’est fait » qui décalerait la suite (2026-10-06)', () => {
  it('récapitule la dose, coche la case et montre les dates avant d’enregistrer', async () => {
    const wrapper = await ouvrir()
    const [caseDecaler] = dansLaFeuille<HTMLInputElement>('.treatment-shift__input')

    expect(texte('.treatment-done-confirm__recap')).toBe(
      'Dose du vendredi 16 oct., donnée le lundi 19 oct.',
    )
    expect(caseDecaler!.checked).toBe(true)
    expect(texte('.treatment-shift__help')).toBe(
      'Les doses suivantes passeront au lundi : 26 oct., 2 nov.',
    )

    caseDecaler!.click()
    await flushPromises()
    expect(texte('.treatment-shift__help')).toBe(
      'Seule cette dose change. Les suivantes restent le vendredi : 23, 30 oct.',
    )
    wrapper.unmount()
  })

  it('« Enregistrer » envoie la prise avec l’état de la case', async () => {
    const wrapper = await ouvrir()

    dansLaFeuille<HTMLButtonElement>('.treatment-done-confirm__save')[0]!.click()
    await flushPromises()
    dansLaFeuille<HTMLInputElement>('.treatment-shift__input')[0]!.click()
    await flushPromises()
    dansLaFeuille<HTMLButtonElement>('.treatment-done-confirm__save')[0]!.click()
    await flushPromises()

    expect(wrapper.emitted('note')).toEqual([
      [{ kind: 'given', due: DUE_16, givenOn: TODAY, shiftsFollowing: true }],
      [{ kind: 'given', due: DUE_16, givenOn: TODAY, shiftsFollowing: false }],
    ])
    wrapper.unmount()
  })

  it('« Annuler » ferme sans rien écrire', async () => {
    const wrapper = await ouvrir()

    dansLaFeuille<HTMLButtonElement>('.treatment-done-confirm__cancel')[0]!.click()
    await flushPromises()

    expect(wrapper.emitted('note')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('se rouvre cochée', async () => {
    const wrapper = await ouvrir()
    dansLaFeuille<HTMLInputElement>('.treatment-shift__input')[0]!.click()
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(dansLaFeuille<HTMLInputElement>('.treatment-shift__input')[0]!.checked).toBe(true)
    wrapper.unmount()
  })

  it('avec une date de fin, avertit de la dose perdue (V28 bis)', async () => {
    const wrapper = await ouvrir('2026-10-30')

    expect(texte('.treatment-shift__help--warning')).toBe(
      'Avec le décalage, la dose du 30 oct. ne sera plus prévue (date de fin).',
    )
    wrapper.unmount()
  })
})
