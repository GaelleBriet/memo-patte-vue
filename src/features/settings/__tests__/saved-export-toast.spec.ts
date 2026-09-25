import { FileOpener } from '@capawesome-team/capacitor-file-opener'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { showSavedExportToast } from '../logic/saved-export-toast'
import { applyLocale } from '@/core/i18n'
import {
  dismissToast,
  runToastAction,
  toastAction,
  toastMessage,
  toastTone,
} from '@/shared/utils/toast'

vi.mock('@capawesome-team/capacitor-file-opener', () => ({
  FileOpener: { openFile: vi.fn<() => Promise<void>>(async () => {}) },
}))

const PDF = {
  uri: 'file:///storage/emulated/0/Documents/M%C3%A9moPatte/carnet-milo-20260923-1432.pdf',
  mimeType: 'application/pdf',
}

const SAVED = 'PDF enregistré dans Documents › MémoPatte'

beforeEach(() => {
  vi.mocked(FileOpener.openFile).mockReset().mockResolvedValue()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  dismissToast()
  vi.useRealTimers()
  vi.restoreAllMocks()
  applyLocale('fr')
})

describe('showSavedExportToast', () => {
  it('dit où est le fichier et propose « Ouvrir », nommé pour le lecteur d’écran, pendant 4 s', () => {
    showSavedExportToast(PDF, { message: SAVED, openAriaLabel: 'Ouvrir le PDF' })

    expect(toastMessage.value).toBe(SAVED)
    expect(toastTone.value).toBe('success')
    expect(toastAction.value).toMatchObject({ label: 'Ouvrir', ariaLabel: 'Ouvrir le PDF' })
    vi.advanceTimersByTime(3900)
    expect(toastMessage.value).toBe(SAVED)
    vi.advanceTimersByTime(200)
    expect(toastMessage.value).toBeNull()
  })

  it('suit la langue de l’app', () => {
    applyLocale('en')

    showSavedExportToast(PDF, {
      message: 'PDF saved to Documents › MémoPatte',
      openAriaLabel: 'Open the PDF',
    })

    expect(toastAction.value?.label).toBe('Open')
  })

  it('ne propose rien à ouvrir sans fichier sur le téléphone (téléchargement du navigateur)', () => {
    showSavedExportToast(null, { message: SAVED, openAriaLabel: 'Ouvrir le PDF' })

    expect(toastMessage.value).toBe(SAVED)
    expect(toastAction.value).toBeNull()
  })

  it('« Ouvrir » confie le fichier à l’app par défaut, avec son URI et son type', async () => {
    showSavedExportToast(PDF, { message: SAVED, openAriaLabel: 'Ouvrir le PDF' })

    runToastAction()
    await flushPromises()

    expect(FileOpener.openFile).toHaveBeenCalledExactlyOnceWith({
      path: PDF.uri,
      mimeType: 'application/pdf',
    })
    expect(toastMessage.value).toBeNull()
  })

  it.each(['File cannot be opened.', 'File does not exist.'])(
    'le dit clairement, sans lever, quand le fichier ne s’ouvre pas (« %s »)',
    async (reason) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(FileOpener.openFile).mockRejectedValue(new Error(reason))
      showSavedExportToast(PDF, { message: SAVED, openAriaLabel: 'Ouvrir le PDF' })

      runToastAction()
      await flushPromises()

      expect(toastMessage.value).toBe(
        'Aucune app n’a pu ouvrir ce fichier. Il reste dans Documents › MémoPatte.',
      )
      expect(toastTone.value).toBe('error')
      expect(toastAction.value).toBeNull()
      expect(warn).toHaveBeenCalledOnce()
    },
  )
})
