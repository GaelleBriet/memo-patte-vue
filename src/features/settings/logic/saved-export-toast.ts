import { FileOpener } from '@capawesome-team/capacitor-file-opener'

import type { SavedFile } from './export-delivery'
import i18n from '@/core/i18n'
import { showToast } from '@/shared/utils/toast'

const SAVED_TOAST_MS = 4000

async function openSavedFile(file: SavedFile): Promise<void> {
  try {
    await FileOpener.openFile({ path: file.uri, mimeType: file.mimeType })
  } catch (cause) {
    console.warn('Export non ouvert :', cause)
    showToast(i18n.global.t('settings.export.openFailed'), { tone: 'error' })
  }
}

/** Confirme un enregistrement ; « Ouvrir » n'apparaît qu'avec un fichier écrit sur le téléphone. */
export function showSavedExportToast(
  message: string,
  openAriaLabel: string,
  file: SavedFile | null,
): void {
  showToast(message, {
    durationMs: SAVED_TOAST_MS,
    action: file
      ? {
          label: i18n.global.t('settings.export.open'),
          ariaLabel: openAriaLabel,
          run: () => void openSavedFile(file),
        }
      : undefined,
  })
}
