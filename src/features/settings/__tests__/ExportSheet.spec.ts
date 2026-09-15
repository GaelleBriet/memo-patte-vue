import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExportSheet from '../ExportSheet.vue'
import type { DeliveryOutcome } from '../export-delivery'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, toastMessage } from '@/shared/toast'

const exportData = vi.hoisted(() => vi.fn<(format: 'json' | 'csv') => Promise<DeliveryOutcome>>())

vi.mock('../data-export.service', () => ({ dataExportService: { exportData } }))

let wrapper: VueWrapper | null = null

beforeEach(() => {
  exportData.mockReset()
  exportData.mockResolvedValue('shared')
  dismissToast()
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

async function monter() {
  wrapper = mount(ExportSheet, {
    props: {
      modelValue: true,
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
    },
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function feuille(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('.export-sheet .bottom-sheet__panel')
  if (!element) throw new Error('Feuille absente du document')
  return element
}

function choix(): HTMLElement[] {
  return [...feuille().querySelectorAll<HTMLElement>('[role="radio"]')]
}

function bouton(): HTMLButtonElement {
  return feuille().querySelector<HTMLButtonElement>('.export-sheet__submit')!
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((ok) => (resolve = ok))
  return { promise, resolve }
}

describe('ExportSheet', () => {
  it('propose JSON ou CSV, JSON coché par défaut', async () => {
    await monter()

    expect(feuille().querySelector('.bottom-sheet__title')?.textContent).toBe(
      'Exporter tes données',
    )
    expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Choisis un format.',
    )
    expect(
      choix().map((option) => [
        option.querySelector('.export-sheet__choice-label')?.textContent?.trim(),
        option.querySelector('.export-sheet__choice-description')?.textContent?.trim(),
      ]),
    ).toEqual([
      ['JSON', 'Pour réimporter dans MémoPatte'],
      ['CSV', 'Pour un tableur'],
    ])
    expect(choix().map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(bouton().textContent?.trim()).toBe('Exporter')
  })

  it('exporte au format choisi, puis ferme la feuille et confirme', async () => {
    const wrapper = await monter()

    choix()[1]!.click()
    await flushPromises()
    expect(choix()[1]!.getAttribute('aria-checked')).toBe('true')

    bouton().click()
    await flushPromises()

    expect(exportData).toHaveBeenCalledWith('csv')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Données exportées')
  })

  it('affiche « Préparation… » et bloque le bouton pendant la génération', async () => {
    const pending = deferred<DeliveryOutcome>()
    exportData.mockReturnValue(pending.promise)
    await monter()

    bouton().click()
    await flushPromises()

    expect(bouton().textContent?.trim()).toBe('Préparation…')
    expect(bouton().disabled).toBe(true)
    expect(feuille().querySelector('.v-progress-circular')).not.toBeNull()

    bouton().click()
    expect(exportData).toHaveBeenCalledOnce()

    pending.resolve('shared')
    await flushPromises()
  })

  it('reste ouverte, sans message, quand la feuille de partage est fermée', async () => {
    exportData.mockResolvedValue('cancelled')
    const wrapper = await monter()

    bouton().click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(toastMessage.value).toBeNull()
    expect(feuille().querySelector('[role="alert"]')).toBeNull()
    expect(bouton().textContent?.trim()).toBe('Exporter')
  })

  it('signale un échec dans la feuille, et repart propre à la réouverture', async () => {
    exportData.mockRejectedValue(new Error('disque plein'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = await monter()

    choix()[1]!.click()
    bouton().click()
    await flushPromises()

    expect(feuille().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'L’export n’a pas pu être préparé. Réessaie.',
    )
    expect(toastMessage.value).toBeNull()

    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(feuille().querySelector('[role="alert"]')).toBeNull()
    expect(choix()[0]!.getAttribute('aria-checked')).toBe('true')
  })
})
