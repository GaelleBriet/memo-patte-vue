import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TreatmentChooseDays from '../views/TreatmentChooseDays.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { days } from '@/shared/__tests__/treatment-schedule-fixtures'
import type { Due } from '@/shared/domain/treatment-schedule'

const NBSP = / /g
const VINGT: Due[] = days('2026-09-03', '2026-09-22').map((dueOn) => ({
  periodId: 'p-1',
  dueOn,
  dueTime: null,
}))

let wrapper: VueWrapper | null = null

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
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function ouvrir(dues: Due[]) {
  wrapper = mount(TreatmentChooseDays, {
    props: { modelValue: true, subtitle: 'Panacur · Milo', dues, when: 'du 3 au 22 sept.' },
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function jours(): HTMLButtonElement[] {
  return [
    ...document.body.querySelectorAll<HTMLButtonElement>(
      '.choose-days-month__day[role="checkbox"]',
    ),
  ]
}

function valider(): HTMLButtonElement {
  return document.body.querySelector<HTMLButtonElement>('.treatment-choose-days__submit')!
}

function bouton() {
  return {
    texte: valider().textContent?.replace(NBSP, ' ').trim(),
    nom: valider().getAttribute('aria-label')?.replace(NBSP, ' '),
  }
}

describe('TreatmentChooseDays — le bouton compte comme l’écriture', () => {
  it('une case décochée qui sort de la liste ne compte plus, ni au total ni à l’écriture', async () => {
    const view = await ouvrir(VINGT)
    jours()[0]!.click()
    jours()[1]!.click()
    await flushPromises()

    expect(bouton().texte).toBe('Valider : 18 données, 2 oubliées')

    await view.setProps({ dues: VINGT.slice(1) })

    expect(bouton()).toEqual({
      texte: 'Valider : 18 données, 1 oubliée',
      nom: 'Valider : 18 données, 1 oubliée, du 3 au 22 sept.',
    })

    valider().click()
    await flushPromises()

    expect(view.emitted('confirm')).toEqual([[{ given: VINGT.slice(2), missed: [VINGT[1]] }]])
  })

  it('une liste vidée ne donne jamais un compte négatif', async () => {
    const view = await ouvrir(VINGT)
    jours()[0]!.click()
    jours()[1]!.click()
    await flushPromises()

    await view.setProps({ dues: [] })

    expect(bouton().texte).toBe('Valider : 0 donnée, 0 oubliée')
  })
})
