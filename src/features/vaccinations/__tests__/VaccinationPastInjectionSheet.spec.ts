import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import VaccinationPastInjectionSheet from '../views/VaccinationPastInjectionSheet.vue'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

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
  applyLocale('fr')
  vi.unstubAllGlobals()
})

async function monter(props: Partial<{ busy: boolean }> = {}) {
  wrapper = mount(VaccinationPastInjectionSheet, {
    props: {
      modelValue: true,
      name: 'Rage',
      animal: 'Milo',
      today: '2026-09-23',
      taken: ['2024-06-02', '2023-06-02'],
      busy: false,
      ...props,
    },
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function champ(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('#past-injection-date')!
}

function bouton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.past-injection-sheet__submit')!
}

async function saisir(date: string) {
  champ().value = date
  champ().dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('VaccinationPastInjectionSheet — V12 bis', () => {
  it('ne demande que la date, bornée à aujourd’hui, et attend une date pour « Ajouter »', async () => {
    await monter()

    const feuille = document.querySelector('.past-injection-sheet')!
    expect(feuille.querySelector('.bottom-sheet__title')?.textContent).toBe('Rage · Milo')
    expect(feuille.querySelector('.bottom-sheet__subtitle')?.textContent).toBe('Injection passée')
    expect(feuille.querySelector('.past-injection-sheet__title')?.textContent).toBe(
      'Ajouter une injection passée',
    )
    expect(feuille.querySelector('label[for="past-injection-date"]')?.textContent).toContain(
      'Date de l’injection',
    )
    expect(champ().type).toBe('date')
    expect(champ().max).toBe('2026-09-23')
    expect(champ().min).toBe('')
    expect(feuille.querySelectorAll('input')).toHaveLength(1)
    expect(bouton().textContent?.trim()).toBe('Ajouter')
    expect(bouton().disabled).toBe(true)
  })

  it('émet la date choisie, même d’avant la naissance (VA-10)', async () => {
    const view = await monter()

    await saisir('2001-06-20')
    bouton().click()

    expect(view.emitted('add')).toEqual([['2001-06-20']])
  })

  it('refuse un jour qui a déjà son injection, ou une date future', async () => {
    const view = await monter()

    await saisir('2024-06-02')
    expect(document.querySelector('.form-field__error')?.textContent).toContain(
      'Une injection est déjà notée ce jour-là.',
    )
    expect(bouton().disabled).toBe(true)

    await saisir('2026-09-24')
    expect(document.querySelector('.form-field__error')?.textContent).toContain(
      'La date de l’injection ne peut pas être dans le futur.',
    )
    bouton().click()
    expect(view.emitted('add')).toBeUndefined()
  })

  it('n’émet rien pendant l’écriture', async () => {
    const view = await monter({ busy: true })

    await saisir('2022-06-20')
    bouton().click()

    expect(view.emitted('add')).toBeUndefined()
  })

  it('parle anglais', async () => {
    applyLocale('en')
    await monter()

    expect(document.querySelector('.bottom-sheet__subtitle')?.textContent).toBe('Past injection')
    expect(document.querySelector('.past-injection-sheet__title')?.textContent).toBe(
      'Add a past injection',
    )
    expect(bouton().textContent?.trim()).toBe('Add')
  })
})
