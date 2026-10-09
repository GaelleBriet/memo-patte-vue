import { FileOpener } from '@capawesome-team/capacitor-file-opener'

import type { SavedFile } from '../service/export-delivery.service'
import type { Translate } from '@/core/i18n/translate'
import { showToast } from '@/shared/utils/toast'

const SAVED_TOAST_MS = 4000

async function openSavedFile(file: SavedFile, t: Translate): Promise<void> {
  try {
    await FileOpener.openFile({ path: file.uri, mimeType: file.mimeType })
  } catch (cause) {
    console.warn('Export non ouvert :', cause)
    showToast(t('settings.export.openFailed'), { tone: 'error' })
  }
}

export type SavedExportToast = {
  message: string
  openAriaLabel?: string
}

/** Confirme un enregistrement ; « Ouvrir » n'apparaît qu'avec un fichier écrit sur le téléphone et son libellé. */
export function showSavedExportToast(
  file: SavedFile | null,
  { message, openAriaLabel }: SavedExportToast,
  t: Translate,
): void {
  showToast(message, {
    durationMs: SAVED_TOAST_MS,
    action:
      file && openAriaLabel
        ? {
            label: t('settings.export.open'),
            ariaLabel: openAriaLabel,
            run: () => void openSavedFile(file, t),
          }
        : undefined,
  })
}
