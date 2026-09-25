import { FileOpener } from '@capawesome-team/capacitor-file-opener'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PdfExportSheet, { type PdfExportAnimal } from '../views/PdfExportSheet.vue'
import type { DeliveryMode } from '../logic/export-delivery'
import type { SaveAccess } from '../logic/export-storage-access'
import type { PdfExportOutcome } from '../service/pdf-export.service'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, runToastAction, toastAction, toastMessage } from '@/shared/utils/toast'

const exportAnimalCarnetPdf = vi.hoisted(() =>
  vi.fn<(animalId: string, mode: DeliveryMode, exportedAt?: Date) => Promise<PdfExportOutcome>>(),
)
const storage = vi.hoisted(() => ({
  checkSaveAccess: vi.fn<() => Promise<SaveAccess>>(),
  requestSaveAccess: vi.fn<() => Promise<SaveAccess>>(),
  openAppSettings: vi.fn<() => Promise<void>>(),
}))

vi.mock('../service/pdf-export.service', () => ({
  pdfExportService: { exportAnimalCarnetPdf },
}))
vi.mock('../logic/export-storage-access', () => storage)
vi.mock('@/core/app-lifecycle/app-resume', () => ({ useAppResume: () => {} }))
vi.mock('@capawesome-team/capacitor-file-opener', () => ({
  FileOpener: { openFile: vi.fn<() => Promise<void>>(async () => {}) },
}))

const SAVED_PDF = {
  uri: 'file:///storage/emulated/0/Documents/M%C3%A9moPatte/carnet-milo-20260923-1030.pdf',
  mimeType: 'application/pdf',
}

const MILO: PdfExportAnimal = { id: 'milo-id', name: 'Milo', species: 'dog' }
const LUNA: PdfExportAnimal = { id: 'luna-id', name: 'Luna', species: 'cat' }
const OPENED_AT = new Date('2026-09-23T10:30:00')

let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: OPENED_AT })
  exportAnimalCarnetPdf.mockReset()
  exportAnimalCarnetPdf.mockImplementation(async (_, mode) =>
    mode === 'save' ? { status: 'saved', file: SAVED_PDF } : 'shared',
  )
  vi.mocked(FileOpener.openFile).mockReset().mockResolvedValue()
  storage.checkSaveAccess.mockReset().mockResolvedValue('granted')
  storage.requestSaveAccess.mockReset().mockResolvedValue('granted')
  storage.openAppSettings.mockReset().mockResolvedValue()
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
  vi.useRealTimers()
  applyLocale('fr')
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

function carteFichier(): HTMLElement | null {
  return feuille().querySelector<HTMLElement>('.pdf-export-sheet__file')
}

function enregistrer(): HTMLButtonElement {
  return feuille().querySelector<HTMLButtonElement>('.export-actions__save')!
}

function partager(): HTMLButtonElement {
  return feuille().querySelector<HTMLButtonElement>('.export-actions__share')!
}

describe('PdfExportSheet', () => {
  it("présente le fichier de l'unique animal, sans sélecteur", async () => {
    await monter([MILO])

    expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Le carnet complet de Milo, prêt à imprimer ou à envoyer.',
    )
    expect(choix()).toHaveLength(0)
    expect(carteFichier()?.querySelector('.pdf-export-sheet__file-name')?.textContent?.trim()).toBe(
      'carnet-milo-20260923-1030.pdf',
    )
    expect(
      carteFichier()?.querySelector('.pdf-export-sheet__file-content')?.textContent?.trim(),
    ).toBe('Vaccins, traitements, poids et photos')
    expect(enregistrer().textContent?.trim()).toBe('Enregistrer sur le téléphone')
    expect(partager().textContent?.trim()).toBe('Partager')
  })

  it('nomme le fichier en anglais quand l’app est en anglais', async () => {
    applyLocale('en')
    await monter([MILO])

    expect(carteFichier()?.querySelector('.pdf-export-sheet__file-name')?.textContent?.trim()).toBe(
      'health-record-milo-20260923-1030.pdf',
    )
  })

  it('enregistre le PDF sous le nom affiché, ferme la feuille et dit où le trouver', async () => {
    await monter([MILO])
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
      now: new Date('2026-09-23T10:31:00'),
    })

    enregistrer().click()
    await flushPromises()

    expect(storage.requestSaveAccess).toHaveBeenCalledOnce()
    expect(exportAnimalCarnetPdf).toHaveBeenCalledExactlyOnceWith('milo-id', 'save', OPENED_AT)
    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('PDF enregistré dans Documents › MémoPatte')
    expect(toastAction.value).toMatchObject({ label: 'Ouvrir', ariaLabel: 'Ouvrir le PDF' })
    vi.advanceTimersByTime(3900)
    expect(toastMessage.value).toBe('PDF enregistré dans Documents › MémoPatte')
    vi.advanceTimersByTime(200)
    expect(toastMessage.value).toBeNull()
  })

  it('« Ouvrir » ouvre le PDF tout juste enregistré', async () => {
    await monter([MILO])

    enregistrer().click()
    await flushPromises()
    runToastAction()
    await flushPromises()

    expect(FileOpener.openFile).toHaveBeenCalledExactlyOnceWith({
      path: SAVED_PDF.uri,
      mimeType: 'application/pdf',
    })
  })

  it('ne propose pas « Ouvrir » dans le navigateur, où le PDF est un téléchargement', async () => {
    exportAnimalCarnetPdf.mockResolvedValue({ status: 'saved', file: null })
    await monter([MILO])

    enregistrer().click()
    await flushPromises()

    expect(toastMessage.value).toBe('PDF enregistré dans Documents › MémoPatte')
    expect(toastAction.value).toBeNull()
  })

  it('partage le PDF comme avant', async () => {
    await monter([MILO])

    partager().click()
    await flushPromises()

    expect(storage.requestSaveAccess).not.toHaveBeenCalled()
    expect(exportAnimalCarnetPdf).toHaveBeenCalledExactlyOnceWith('milo-id', 'share', OPENED_AT)
    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('PDF exporté')
    expect(toastAction.value).toBeNull()
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
    expect(carteFichier()).toBeNull()

    choix()[1]!.click()
    await flushPromises()
    enregistrer().click()
    await flushPromises()

    expect(exportAnimalCarnetPdf).toHaveBeenCalledWith('luna-id', 'save', OPENED_AT)
  })

  it('reste ouverte, sans message, quand la feuille de partage est fermée', async () => {
    exportAnimalCarnetPdf.mockResolvedValue('cancelled')
    await monter([MILO])

    partager().click()
    await flushPromises()

    expect(wrapper!.emitted('update:modelValue')).toBeUndefined()
    expect(toastMessage.value).toBeNull()
  })

  it('renvoie aux réglages quand l’accès au stockage est bloqué, sans rien préparer', async () => {
    storage.requestSaveAccess.mockResolvedValue('blocked')
    await monter([MILO])

    enregistrer().click()
    await flushPromises()

    expect(exportAnimalCarnetPdf).not.toHaveBeenCalled()
    expect(feuille().querySelector('.export-actions__notice p')?.textContent?.trim()).toBe(
      'L’accès au stockage est bloqué. Autorise-le dans les réglages de l’app, ou partage le fichier.',
    )
    expect(enregistrer().disabled).toBe(true)
    expect(partager().disabled).toBe(false)

    feuille().querySelector<HTMLButtonElement>('.export-actions__settings')!.click()
    expect(storage.openAppSettings).toHaveBeenCalledOnce()
  })

  it('s’ouvre sur l’accès bloqué quand Android ne demande plus', async () => {
    storage.checkSaveAccess.mockResolvedValue('blocked')
    await monter([MILO])

    expect(feuille().querySelector('.export-actions__settings')).not.toBeNull()
    expect(enregistrer().disabled).toBe(true)
    expect(partager().disabled).toBe(false)
  })

  it('signale un échec, et repart propre à la réouverture', async () => {
    exportAnimalCarnetPdf.mockRejectedValue(new Error('disque plein'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = await monter([MILO, LUNA])

    choix()[1]!.click()
    enregistrer().click()
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
