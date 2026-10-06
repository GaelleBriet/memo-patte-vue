import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExactRemindersExplainer from '../components/ExactRemindersExplainer.vue'
import { onBackButton } from '@/core/app-lifecycle/back-button'
import { openExactRemindersSettings } from '@/core/notifications/exact-reminders'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

vi.mock('@/core/notifications/exact-reminders', () => ({
  openExactRemindersSettings: vi.fn<() => Promise<string>>(),
}))

vi.mock('@/core/app-lifecycle/back-button', () => ({
  onBackButton: vi.fn<(handler: () => void) => () => void>(() => () => {}),
}))

const openSettings = vi.mocked(openExactRemindersSettings)
const backButton = vi.mocked(onBackButton)
const NBSP = /\u00a0/g

let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
  openSettings.mockResolvedValue('precise')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function ouvrir() {
  wrapper = mount(ExactRemindersExplainer, {
    props: { modelValue: true, backLabel: 'Retour au formulaire' },
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function texte(selector: string): string | undefined {
  return document.body.querySelector(selector)?.textContent?.replace(NBSP, ' ').trim()
}

function bouton(selector: string): HTMLButtonElement {
  return document.body.querySelector<HTMLButtonElement>(selector)!
}

describe('ExactRemindersExplainer — contenu (V2 bis)', () => {
  it('reprend les textes de la maquette', async () => {
    await ouvrir()

    expect(texte('.pushed-screen__title')).toBe('Rappels précis')
    expect(texte('.pushed-screen__subtitle')).toBe('Réglage Android')
    expect(texte('.exact-reminders__title')).toBe('Recevoir les rappels à l’heure pile')
    expect(texte('.exact-reminders__text')).toBe(
      'Sans cette autorisation, Android peut retarder un rappel : jamais avant l’heure, souvent de quelques minutes, parfois d’une heure ou plus quand le téléphone économise sa batterie.',
    )
    expect(
      [...document.body.querySelectorAll('.exact-reminders__step')].map((step) =>
        [...step.children].map((part) => part.textContent?.replace(NBSP, ' ').trim()).join(' '),
      ),
    ).toEqual([
      '1 Touche « Ouvrir les réglages ».',
      '2 Dans « Alarmes et rappels », active l’autorisation pour MémoPatte.',
      '3 Reviens dans MémoPatte : ton choix est pris en compte.',
    ])
    expect(texte('.exact-reminders__skip')).toBe(
      'Tu peux t’en passer : tes rappels arriveront quand même, parfois en retard.',
    )
    expect(texte('.exact-reminders__open')).toBe('Ouvrir les réglages')
    expect(bouton('.exact-reminders__open').getAttribute('aria-label')).toBe(
      'Ouvrir le réglage Android Alarmes et rappels',
    )
    expect(texte('.exact-reminders__later')).toBe('Plus tard')
    expect(bouton('.pushed-screen__back').getAttribute('aria-label')).toBe('Retour au formulaire')
  })
})

describe('ExactRemindersExplainer — gestes', () => {
  it('n’ouvre le réglage Android qu’au toucher de « Ouvrir les réglages », puis se ferme', async () => {
    const view = await ouvrir()
    expect(openSettings).not.toHaveBeenCalled()

    bouton('.exact-reminders__open').click()
    await flushPromises()

    expect(openSettings).toHaveBeenCalledOnce()
    expect(view.emitted('update:modelValue')).toEqual([[false]])
  })

  it('se ferme sans rien ouvrir sur « Plus tard »', async () => {
    const view = await ouvrir()

    bouton('.exact-reminders__later').click()
    await flushPromises()

    expect(openSettings).not.toHaveBeenCalled()
    expect(view.emitted('update:modelValue')).toEqual([[false]])
  })

  it('se ferme sans rien ouvrir sur la flèche', async () => {
    const view = await ouvrir()

    bouton('.pushed-screen__back').click()
    await flushPromises()

    expect(openSettings).not.toHaveBeenCalled()
    expect(view.emitted('update:modelValue')).toEqual([[false]])
  })

  it('se ferme sans rien ouvrir sur le retour Android', async () => {
    const view = await ouvrir()

    backButton.mock.calls.at(-1)?.[0]()
    await flushPromises()

    expect(openSettings).not.toHaveBeenCalled()
    expect(view.emitted('update:modelValue')).toEqual([[false]])
  })
})
