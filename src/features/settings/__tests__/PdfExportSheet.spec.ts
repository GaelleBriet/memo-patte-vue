import { FileOpener } from '@capawesome-team/capacitor-file-opener'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PdfExportSheet, { type PdfExportAnimal } from '../views/PdfExportSheet.vue'
import type { DeliveryMode } from '../logic/export-delivery'
import type { SaveAccess } from '../logic/export-storage-access'
import type { PdfExportOutcome, PdfExportRequest } from '../service/pdf-export.service'
import i18n, { applyLocale } from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, runToastAction, toastAction, toastMessage } from '@/shared/utils/toast'

const exportCarnetPdf = vi.hoisted(() =>
  vi.fn<(request: PdfExportRequest, mode: DeliveryMode) => Promise<PdfExportOutcome>>(),
)
const storage = vi.hoisted(() => ({
  checkSaveAccess: vi.fn<() => Promise<SaveAccess>>(),
  requestSaveAccess: vi.fn<() => Promise<SaveAccess>>(),
  openAppSettings: vi.fn<() => Promise<void>>(),
}))

vi.mock('../service/pdf-export.service', () => ({
  pdfExportService: { exportCarnetPdf },
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

const MILO: PdfExportAnimal = { id: 'milo-id', name: 'Milo' }
const LUNA: PdfExportAnimal = { id: 'luna-id', name: 'Luna' }
const PIXEL: PdfExportAnimal = { id: 'pixel-id', name: 'Pixel' }
const OPENED_AT = new Date('2026-09-23T10:30:00')

let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: OPENED_AT })
  exportCarnetPdf.mockReset()
  exportCarnetPdf.mockImplementation(async (_, mode) =>
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

async function monter(animals: PdfExportAnimal[], unfollowedAnimals: PdfExportAnimal[] = []) {
  wrapper = mount(PdfExportSheet, {
    props: {
      animals,
      unfollowedAnimals,
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

function choix(): HTMLButtonElement[] {
  return [...feuille().querySelectorAll<HTMLButtonElement>('.pdf-export-sheet__choices button')]
}

async function choisir(label: string): Promise<void> {
  choix()
    .find((bouton) => bouton.querySelector('.settings-row__label')?.textContent?.trim() === label)!
    .click()
  await flushPromises()
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
  it('sans animal, ne présente ni fichier ni nom vide', async () => {
    await monter([])

    expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Un carnet de santé imprimable, à garder ou à donner au vétérinaire.',
    )
    expect(carteFichier()).toBeNull()
    expect(feuille().textContent).not.toContain('carnet-memopatte')
    expect(feuille().querySelector('.pdf-export-sheet__choices')).toBeNull()
    expect(feuille().querySelector('.export-actions__save')).toBeNull()
  })

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
    expect(exportCarnetPdf).toHaveBeenCalledExactlyOnceWith(
      { animalIds: ['milo-id'], fileName: 'carnet-milo-20260923-1030.pdf', exportedAt: OPENED_AT },
      'save',
    )
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
    exportCarnetPdf.mockResolvedValue({ status: 'saved', file: null })
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
    expect(exportCarnetPdf).toHaveBeenCalledExactlyOnceWith(
      { animalIds: ['milo-id'], fileName: 'carnet-milo-20260923-1030.pdf', exportedAt: OPENED_AT },
      'share',
    )
    expect(wrapper!.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('PDF exporté')
    expect(toastAction.value).toBeNull()
  })

  it('propose « Tous les animaux » puis chaque animal, dans l’ordre des chips, sans actions', async () => {
    await monter([PIXEL, MILO, LUNA])

    expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Un carnet de santé imprimable, à garder ou à donner au vétérinaire.',
    )
    expect(
      choix().map((bouton) => bouton.querySelector('.settings-row__label')?.textContent?.trim()),
    ).toEqual(['Tous les animaux', 'Pixel', 'Milo', 'Luna'])
    expect(choix()[0]!.querySelector('.settings-row__hint')?.textContent?.trim()).toBe(
      'Pixel, Milo, Luna',
    )
    expect(choix()[0]!.getAttribute('aria-label')).toBe(
      'PDF de tous les animaux suivis\u00a0: Pixel, Milo, Luna',
    )
    expect(choix().every((bouton) => bouton.querySelector('.settings-row__chevron'))).toBe(true)
    expect(carteFichier()).toBeNull()
    expect(feuille().querySelector('.export-actions__save')).toBeNull()
  })

  it('« Tous les animaux » exporte les animaux transmis, dans l’ordre des chips, sous le nom affiché', async () => {
    await monter([PIXEL, MILO, LUNA])

    await choisir('Tous les animaux')

    expect(choix()).toHaveLength(0)
    expect(document.activeElement).toBe(carteFichier())
    expect(carteFichier()?.querySelector('.pdf-export-sheet__file-name')?.textContent?.trim()).toBe(
      'carnet-memopatte-20260923-1030.pdf',
    )

    enregistrer().click()
    await flushPromises()

    expect(exportCarnetPdf).toHaveBeenCalledExactlyOnceWith(
      {
        animalIds: ['pixel-id', 'milo-id', 'luna-id'],
        fileName: 'carnet-memopatte-20260923-1030.pdf',
        exportedAt: OPENED_AT,
      },
      'save',
    )
  })

  it('un animal choisi exporte son seul carnet, nommé d’après lui', async () => {
    await monter([MILO, LUNA])

    await choisir('Luna')
    partager().click()
    await flushPromises()

    expect(exportCarnetPdf).toHaveBeenCalledExactlyOnceWith(
      { animalIds: ['luna-id'], fileName: 'carnet-luna-20260923-1030.pdf', exportedAt: OPENED_AT },
      'share',
    )
  })

  describe('animaux qu’on ne suit plus (DO-4, V23 bis)', () => {
    function lignes(): string[] {
      return [
        ...feuille().querySelectorAll<HTMLElement>(
          '.pdf-export-sheet__choices .settings-row__label, .pdf-export-sheet__group',
        ),
      ].map((element) => element.textContent!.trim())
    }

    it('les propose après les suivis, sous « Animaux que tu ne suis plus », hors de « Tous les animaux »', async () => {
      await monter([MILO, PIXEL], [LUNA])

      expect(lignes()).toEqual([
        'Tous les animaux',
        'Milo',
        'Pixel',
        'Animaux que tu ne suis plus',
        'Luna',
      ])
      expect(choix()[0]!.querySelector('.settings-row__hint')?.textContent?.trim()).toBe(
        'Milo, Pixel',
      )
    })

    it('« Tous les animaux » n’exporte que les animaux suivis', async () => {
      await monter([MILO, PIXEL], [LUNA])

      await choisir('Tous les animaux')
      partager().click()
      await flushPromises()

      expect(exportCarnetPdf).toHaveBeenCalledExactlyOnceWith(
        {
          animalIds: ['milo-id', 'pixel-id'],
          fileName: 'carnet-memopatte-20260923-1030.pdf',
          exportedAt: OPENED_AT,
        },
        'share',
      )
    })

    it('un animal qu’on ne suit plus s’exporte seul, nommé d’après lui', async () => {
      await monter([MILO], [LUNA])

      await choisir('Luna')
      partager().click()
      await flushPromises()

      expect(exportCarnetPdf).toHaveBeenCalledExactlyOnceWith(
        {
          animalIds: ['luna-id'],
          fileName: 'carnet-luna-20260923-1030.pdf',
          exportedAt: OPENED_AT,
        },
        'share',
      )
    })

    it('sans animal suivi, ne propose pas « Tous les animaux »', async () => {
      await monter([], [LUNA, PIXEL])

      expect(lignes()).toEqual(['Animaux que tu ne suis plus', 'Luna', 'Pixel'])
    })

    it('présente directement le fichier quand le seul animal n’est plus suivi', async () => {
      await monter([], [LUNA])

      expect(choix()).toHaveLength(0)
      expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
        'Le carnet complet de Luna, prêt à imprimer ou à envoyer.',
      )
      expect(enregistrer().disabled).toBe(false)

      partager().click()
      await flushPromises()

      expect(exportCarnetPdf).toHaveBeenCalledExactlyOnceWith(
        {
          animalIds: ['luna-id'],
          fileName: 'carnet-luna-20260923-1030.pdf',
          exportedAt: OPENED_AT,
        },
        'share',
      )
    })

    it('titre le groupe en anglais', async () => {
      applyLocale('en')
      await monter([MILO], [LUNA])

      expect(lignes()).toContain('Pets you no longer follow')
    })
  })

  it('présente le choix en anglais', async () => {
    applyLocale('en')
    await monter([MILO, LUNA])

    expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'A printable health record, to keep or give to the vet.',
    )
    expect(choix()[0]!.getAttribute('aria-label')).toBe(
      'PDF of all the pets you follow: Milo, Luna',
    )

    await choisir('All pets')

    expect(carteFichier()?.querySelector('.pdf-export-sheet__file-name')?.textContent?.trim()).toBe(
      'health-record-memopatte-20260923-1030.pdf',
    )
  })

  it('reste ouverte, sans message, quand la feuille de partage est fermée', async () => {
    exportCarnetPdf.mockResolvedValue('cancelled')
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

    expect(exportCarnetPdf).not.toHaveBeenCalled()
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
    exportCarnetPdf.mockRejectedValue(new Error('disque plein'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = await monter([MILO, LUNA])

    await choisir('Milo')
    enregistrer().click()
    await flushPromises()

    expect(feuille().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Le PDF n’a pas pu être préparé. Réessaie.',
    )

    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(feuille().querySelector('[role="alert"]')).toBeNull()
    expect(choix()).toHaveLength(3)
  })
})
