import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as DataImport from '../data-import.service'
import type { DataImportService } from '../data-import.service'
import ImportSheet from '../ImportSheet.vue'
import { IMPORT_FIXTURE, importFixtureJson } from './import-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, toastMessage } from '@/shared/toast'

const hasLocalData = vi.hoisted(() => vi.fn<() => Promise<boolean>>())
const importData = vi.hoisted(() => vi.fn<DataImportService['importData']>())

type DataImportModule = typeof DataImport

vi.mock('../data-import.service', async (importOriginal) => ({
  ...(await importOriginal<DataImportModule>()),
  dataImportService: { hasLocalData, importData },
}))

let wrapper: VueWrapper<InstanceType<typeof ImportSheet>> | null = null

function exportAvecPoidsHorsBornes(): string {
  const document = JSON.parse(importFixtureJson()) as Record<string, unknown>
  ;(document.weightEntries as Record<string, unknown>[])[0]!.weightKg = 1e308
  return JSON.stringify(document)
}

beforeEach(() => {
  hasLocalData.mockReset().mockResolvedValue(true)
  importData.mockReset().mockResolvedValue(undefined)
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(ImportSheet, {
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function champFichier(): HTMLInputElement {
  return wrapper!.get<HTMLInputElement>('input[type="file"]').element
}

async function choisirFichier(content: string) {
  const input = champFichier()
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File([content], 'memopatte-export.json', { type: 'application/json' })],
  })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}

function feuille(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(
    '.import-sheet.v-overlay--active .bottom-sheet__panel',
  )
}

function boutonDeLaFeuille(texte: string): HTMLButtonElement | undefined {
  return [...(feuille()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (bouton) => bouton.textContent?.trim() === texte,
  )
}

function choix(libelle: string): HTMLElement | undefined {
  return [...(feuille()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])].find(
    (option) => option.querySelector('.choice-cards__label')?.textContent?.trim() === libelle,
  )
}

function dialogue(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(
    '.import-confirm-overlay.v-overlay--active .import-confirm',
  )
}

async function cliquer(element: HTMLElement | undefined | null) {
  element!.click()
  await flushPromises()
}

describe('ImportSheet', () => {
  it('ouvre le sélecteur de documents sur des fichiers JSON, sans feuille', async () => {
    await monter()
    const click = vi.spyOn(champFichier(), 'click').mockImplementation(() => undefined)

    wrapper!.vm.pickFile()

    expect(click).toHaveBeenCalledOnce()
    expect(champFichier().accept).toContain('application/json')
    expect(feuille()).toBeNull()
  })

  it('importe directement dans une base vide, signale l’écriture puis prévient', async () => {
    hasLocalData.mockResolvedValue(false)
    let finish!: () => void
    importData.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    await monter()

    await choisirFichier(importFixtureJson())
    expect(wrapper!.emitted('update:busy')).toEqual([[true]])

    finish()
    await flushPromises()

    expect(importData).toHaveBeenCalledWith(IMPORT_FIXTURE, 'replace')
    expect(feuille()).toBeNull()
    expect(toastMessage.value).toBe('Données importées')
    expect(wrapper!.emitted('imported')).toHaveLength(1)
    expect(wrapper!.emitted('update:busy')).toEqual([[true], [false]])
  })

  it('propose fusionner ou remplacer, Continuer grisé tant que rien n’est choisi', async () => {
    await monter()

    await choisirFichier(importFixtureJson())

    expect(feuille()?.querySelector('.bottom-sheet__title')?.textContent).toBe('Importer un export')
    expect(feuille()?.querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Des données existent déjà sur cet appareil.',
    )
    const options = [...feuille()!.querySelectorAll<HTMLElement>('[role="radio"]')]
    expect(
      options.map((option) => [
        option.querySelector('.choice-cards__label')?.textContent?.trim(),
        option.querySelector('.choice-cards__description')?.textContent?.trim(),
      ]),
    ).toEqual([
      ['Fusionner', 'Ajoute ce qui manque, garde tes données actuelles.'],
      ['Remplacer', 'Remplace toutes tes données actuelles.'],
    ])
    expect(options.some((option) => option.getAttribute('aria-checked') === 'true')).toBe(false)
    expect(boutonDeLaFeuille('Continuer')?.disabled).toBe(true)
  })

  it('fusionne sans confirmation, ferme la feuille et confirme par un toast', async () => {
    await monter()
    await choisirFichier(importFixtureJson())

    await cliquer(choix('Fusionner'))
    await cliquer(boutonDeLaFeuille('Continuer'))

    expect(importData).toHaveBeenCalledWith(IMPORT_FIXTURE, 'merge')
    expect(dialogue()).toBeNull()
    expect(feuille()).toBeNull()
    expect(toastMessage.value).toBe('Données importées')
  })

  it('demande confirmation avant de remplacer, et n’écrit rien si on annule', async () => {
    await monter()
    await choisirFichier(importFixtureJson())
    await cliquer(choix('Remplacer'))

    await cliquer(boutonDeLaFeuille('Continuer'))

    expect(dialogue()?.textContent).toContain('Remplacer toutes tes données\u00a0?')
    expect(dialogue()?.textContent).toContain(
      'Cette action supprimera définitivement les données actuelles de l’appareil. Elle est irréversible.',
    )
    const boutons = [...dialogue()!.querySelectorAll<HTMLButtonElement>('button')]
    await cliquer(boutons.find((bouton) => bouton.textContent?.trim() === 'Annuler'))
    expect(dialogue()).toBeNull()
    expect(importData).not.toHaveBeenCalled()

    await cliquer(boutonDeLaFeuille('Continuer'))
    const remplacer = [...dialogue()!.querySelectorAll<HTMLButtonElement>('button')].find(
      (bouton) => bouton.textContent?.trim() === 'Remplacer',
    )
    await cliquer(remplacer)

    expect(importData).toHaveBeenCalledWith(IMPORT_FIXTURE, 'replace')
  })

  it.each([
    ['pas du JSON', 'Ce fichier n’est pas un export MémoPatte.'],
    [JSON.stringify({ schemaVersion: 2 }), 'Cet export vient d’une version plus récente de l’app.'],
    [
      exportAvecPoidsHorsBornes(),
      'Ce fichier contient une valeur hors limites : 200 kg maximum pour un poids, 365 pour une fréquence.',
    ],
  ])('explique un fichier refusé et propose d’en choisir un autre', async (content, message) => {
    await monter()

    await choisirFichier(content)

    expect(feuille()?.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message)
    const click = vi.spyOn(champFichier(), 'click').mockImplementation(() => undefined)
    await cliquer(boutonDeLaFeuille('Choisir un autre fichier'))
    expect(click).toHaveBeenCalledOnce()
    expect(importData).not.toHaveBeenCalled()
  })

  it('signale un import qui n’a pas abouti', async () => {
    importData.mockRejectedValue(new Error('disque plein'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    hasLocalData.mockResolvedValue(false)
    await monter()

    await choisirFichier(importFixtureJson())

    expect(feuille()?.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'L’import n’a pas abouti. Tes données n’ont pas changé.',
    )
    expect(toastMessage.value).toBeNull()
    expect(wrapper!.emitted('imported')).toBeUndefined()
  })
})
