import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExportSheet from '../views/ExportSheet.vue'
import type { DeliveryMode, DeliveryOutcome } from '../logic/export-delivery'
import type { SaveAccess } from '../logic/export-storage-access'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, toastMessage } from '@/shared/utils/toast'

const exportData = vi.hoisted(() =>
  vi.fn<(format: 'json' | 'csv', mode: DeliveryMode) => Promise<DeliveryOutcome>>(),
)
const storage = vi.hoisted(() => ({
  checkSaveAccess: vi.fn<() => Promise<SaveAccess>>(),
  requestSaveAccess: vi.fn<() => Promise<SaveAccess>>(),
  openAppSettings: vi.fn<() => Promise<void>>(),
}))
const resumeListeners = vi.hoisted(() => [] as (() => void)[])

vi.mock('../service/data-export.service', () => ({ dataExportService: { exportData } }))
vi.mock('../logic/export-storage-access', () => storage)
vi.mock('@/core/app-lifecycle/app-resume', () => ({
  useAppResume: (listener: () => void) => resumeListeners.push(listener),
}))

let wrapper: VueWrapper | null = null

beforeEach(() => {
  exportData.mockReset()
  exportData.mockImplementation(async (_, mode) => (mode === 'save' ? 'saved' : 'shared'))
  storage.checkSaveAccess.mockReset().mockResolvedValue('granted')
  storage.requestSaveAccess.mockReset().mockResolvedValue('granted')
  storage.openAppSettings.mockReset().mockResolvedValue()
  resumeListeners.length = 0
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

function enregistrer(): HTMLButtonElement {
  return feuille().querySelector<HTMLButtonElement>('.export-actions__save')!
}

function partager(): HTMLButtonElement {
  return feuille().querySelector<HTMLButtonElement>('.export-actions__share')!
}

function bandeau(): HTMLElement | null {
  return feuille().querySelector<HTMLElement>('.export-actions__notice')
}

function lienReglages(): HTMLButtonElement | null {
  return feuille().querySelector<HTMLButtonElement>('.export-actions__settings')
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((ok) => (resolve = ok))
  return { promise, resolve }
}

describe('ExportSheet', () => {
  it('propose JSON ou CSV, puis « Enregistrer sur le téléphone » et « Partager »', async () => {
    await monter()

    expect(feuille().querySelector('.bottom-sheet__title')?.textContent).toBe(
      'Exporter tes données',
    )
    expect(feuille().querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Choisis un format.',
    )
    expect(
      choix().map((option) => [
        option.querySelector('.choice-cards__label')?.textContent?.trim(),
        option.querySelector('.choice-cards__description')?.textContent?.trim(),
      ]),
    ).toEqual([
      ['JSON', 'Pour réimporter dans MémoPatte'],
      ['CSV', 'Pour un tableur'],
    ])
    expect(choix().map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(enregistrer().textContent?.trim()).toBe('Enregistrer sur le téléphone')
    expect(partager().textContent?.trim()).toBe('Partager')
    expect(enregistrer().disabled).toBe(false)
    expect(bandeau()).toBeNull()
  })

  it.each([
    [0, 'json', 'Export JSON enregistré dans Documents › MémoPatte'],
    [1, 'csv', 'Export CSV enregistré dans Documents › MémoPatte'],
  ] as const)(
    'enregistre au format choisi, ferme la feuille et dit où trouver le fichier (%s)',
    async (index, format, message) => {
      const wrapper = await monter()

      choix()[index]!.click()
      await flushPromises()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      enregistrer().click()
      await flushPromises()

      expect(storage.requestSaveAccess).toHaveBeenCalledOnce()
      expect(exportData).toHaveBeenCalledExactlyOnceWith(format, 'save')
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
      expect(toastMessage.value).toBe(message)
      vi.advanceTimersByTime(3900)
      expect(toastMessage.value).toBe(message)
      vi.advanceTimersByTime(200)
      expect(toastMessage.value).toBeNull()
    },
  )

  it('partage comme avant, sans demander l’accès au stockage', async () => {
    const wrapper = await monter()

    choix()[1]!.click()
    await flushPromises()
    partager().click()
    await flushPromises()

    expect(storage.requestSaveAccess).not.toHaveBeenCalled()
    expect(exportData).toHaveBeenCalledExactlyOnceWith('csv', 'share')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Données exportées')
  })

  it('affiche « Préparation… » sur le bouton touché et bloque les deux pendant la génération', async () => {
    const pending = deferred<DeliveryOutcome>()
    exportData.mockReturnValue(pending.promise)
    await monter()

    partager().click()
    await flushPromises()

    expect(partager().textContent?.trim()).toBe('Préparation…')
    expect(enregistrer().textContent?.trim()).toBe('Enregistrer sur le téléphone')
    expect(partager().disabled).toBe(true)
    expect(enregistrer().disabled).toBe(true)
    expect(partager().querySelector('.v-progress-circular')).not.toBeNull()

    enregistrer().click()
    expect(exportData).toHaveBeenCalledOnce()

    pending.resolve('shared')
    await flushPromises()
  })

  it('reste ouverte, sans message, quand la feuille de partage est fermée', async () => {
    exportData.mockResolvedValue('cancelled')
    const wrapper = await monter()

    partager().click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(toastMessage.value).toBeNull()
    expect(feuille().querySelector('[role="alert"]')).toBeNull()
    expect(partager().textContent?.trim()).toBe('Partager')
  })

  it('accès refusé (Android 7 à 10) : l’explique, Enregistrer redemande, Partager reste possible', async () => {
    storage.requestSaveAccess.mockResolvedValue('refused')
    const wrapper = await monter()

    enregistrer().click()
    await flushPromises()

    expect(exportData).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(bandeau()?.textContent?.trim()).toBe(
      'MémoPatte n’a pas accès au stockage. Réessaie, ou partage le fichier.',
    )
    expect(lienReglages()).toBeNull()
    expect(feuille().querySelector('[role="alert"]')).toBeNull()
    expect(enregistrer().disabled).toBe(false)
    expect(partager().disabled).toBe(false)

    storage.requestSaveAccess.mockResolvedValue('granted')
    enregistrer().click()
    await flushPromises()

    expect(storage.requestSaveAccess).toHaveBeenCalledTimes(2)
    expect(exportData).toHaveBeenCalledExactlyOnceWith('json', 'save')
  })

  it('accès bloqué (« Ne plus demander ») : renvoie aux réglages, Enregistrer indisponible', async () => {
    storage.requestSaveAccess.mockResolvedValue('blocked')
    await monter()

    enregistrer().click()
    await flushPromises()

    const texte = bandeau()?.querySelector('p')
    expect(texte?.textContent?.trim()).toBe(
      'L’accès au stockage est bloqué. Autorise-le dans les réglages de l’app, ou partage le fichier.',
    )
    expect(lienReglages()?.textContent?.trim()).toBe('Ouvrir les réglages de l’app')
    expect(enregistrer().disabled).toBe(true)
    expect(enregistrer().getAttribute('aria-describedby')).toBe(texte?.id)
    expect(partager().disabled).toBe(false)

    lienReglages()!.click()
    expect(storage.openAppSettings).toHaveBeenCalledOnce()
  })

  it('s’ouvre sur l’accès bloqué quand Android ne demande plus', async () => {
    storage.checkSaveAccess.mockResolvedValue('blocked')
    await monter()

    expect(lienReglages()).not.toBeNull()
    expect(enregistrer().disabled).toBe(true)
  })

  it('revient à l’état normal au retour des réglages avec l’accès accordé', async () => {
    storage.checkSaveAccess.mockResolvedValue('blocked')
    await monter()

    storage.checkSaveAccess.mockResolvedValue('granted')
    for (const listener of resumeListeners) listener()
    await flushPromises()

    expect(bandeau()).toBeNull()
    expect(enregistrer().disabled).toBe(false)
  })

  it('signale un échec dans la feuille, et repart propre à la réouverture', async () => {
    exportData.mockRejectedValue(new Error('disque plein'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = await monter()

    choix()[1]!.click()
    enregistrer().click()
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
