import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PastDuesTexts } from '../logic/treatment-past-dues'
import TreatmentPastDuesSheet from '../views/TreatmentPastDuesSheet.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

const TEXTS: PastDuesTexts = {
  title: '1 dose était prévue avant aujourd’hui',
  text: 'Le 17 mars, au rythme « tous les jours ».',
  keep: 'Elle reste à renseigner',
  keepHint: 'Le nouveau rythme commence aujourd’hui. Prochaine dose le 17 mars.',
  drop: 'Elle n’était pas à donner',
  dropHint:
    'Avec ce rythme, plus aucune dose avant la date de fin. Change la date de fin ou le rythme.',
  dropRefused: true,
  cancel: 'Annuler',
}

let wrapper: VueWrapper | undefined

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
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function open(texts: PastDuesTexts) {
  wrapper = mount(TreatmentPastDuesSheet, {
    props: { modelValue: true, texts },
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const drop = () =>
  document.body.querySelector<HTMLButtonElement>('.treatment-past-dues__choice--drop')!

describe('TreatmentPastDuesSheet', () => {
  it('#806 : « pas à donner » refusé ne se choisit pas, il dit pourquoi', async () => {
    const sheet = await open(TEXTS)

    expect(drop().disabled).toBe(true)
    expect(drop().textContent).toContain('plus aucune dose avant la date de fin')
    drop().click()
    expect(sheet.emitted('choose')).toBeUndefined()
  })

  it('les deux réponses se choisissent quand aucune n’est refusée', async () => {
    const sheet = await open({ ...TEXTS, dropRefused: false })

    drop().click()
    expect(sheet.emitted('choose')).toEqual([['drop']])
  })
})
