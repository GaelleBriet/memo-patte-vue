import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PdfExportSheet, { type PdfExportAnimal } from '../PdfExportSheet.vue'
import type { PdfExportOutcome } from '../pdf-export.service'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, toastMessage } from '@/shared/utils/toast'

const exportAnimalCarnetPdf = vi.hoisted(() =>
  vi.fn<(animalId: string) => Promise<PdfExportOutcome>>(),
)

vi.mock('../pdf-export.service', () => ({
  pdfExportService: { exportAnimalCarnetPdf },
}))

const MILO: PdfExportAnimal = { id: 'milo-id', name: 'Milo', species: 'dog' }
const LUNA: PdfExportAnimal = { id: 'luna-id', name: 'Luna', species: 'cat' }

let wrapper: VueWrapper | null = null

beforeEach(() => {
  exportAnimalCarnetPdf.mockReset()
  exportAnimalCarnetPdf.mockResolvedValue('shared')
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

async function monter(animals: PdfExportAnimal[]) {
  wrapper = mount(PdfExportSheet, {
    props: {
      animals,
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
  const element = document.body.querySelector<HTMLElement>('.pdf-export-sheet .bottom-sheet__panel')
  if (!element) throw new Error('Feuille absente du document')
  return element
}

function choix(): HTMLElement[] {
  return [...feuille().querySelectorAll<HTMLElement>('[role="radio"]')]
}

function bouton(): HTMLButtonElement {
  return feuille().querySelector<HTMLButtonElement>('.pdf-export-sheet__submit')!
}

describe('PdfExportSheet', () => {
  it("génère directement pour l'unique animal, sans sélecteur", async () => {
    await monter([MILO])

    expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Un document sera préparé pour Milo.',
    )
    expect(choix()).toHaveLength(0)

    bouton().click()
    await flushPromises()

    expect(exportAnimalCarnetPdf).toHaveBeenCalledWith('milo-id')
    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('PDF exporté')
  })

  it('propose un choix quand plusieurs animaux existent, le premier coché', async () => {
    await monter([MILO, LUNA])

    expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Choisis l’animal à exporter.',
    )
    expect(
      choix().map((option) => option.querySelector('.choice-cards__label')?.textContent?.trim()),
    ).toEqual(['Milo', 'Luna'])
    expect(choix().map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false'])

    choix()[1]!.click()
    await flushPromises()
    bouton().click()
    await flushPromises()

    expect(exportAnimalCarnetPdf).toHaveBeenCalledWith('luna-id')
  })

  it('reste ouverte, sans message, quand la feuille de partage est fermée', async () => {
    exportAnimalCarnetPdf.mockResolvedValue('cancelled')
    await monter([MILO])

    bouton().click()
    await flushPromises()

    expect(wrapper!.emitted('update:modelValue')).toBeUndefined()
    expect(toastMessage.value).toBeNull()
  })

  it('signale un échec, et repart propre à la réouverture', async () => {
    exportAnimalCarnetPdf.mockRejectedValue(new Error('disque plein'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = await monter([MILO, LUNA])

    choix()[1]!.click()
    bouton().click()
    await flushPromises()

    expect(feuille().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Le PDF n’a pas pu être préparé. Réessaie.',
    )

    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(feuille().querySelector('[role="alert"]')).toBeNull()
    expect(choix()[0]!.getAttribute('aria-checked')).toBe('true')
  })
})
