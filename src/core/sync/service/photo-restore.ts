import { isPhotoFileName } from '@/core/photos/photo-storage'
import { errorSummary } from '@/shared/utils/error-summary'
import { isJpeg, MAX_CLOUD_PHOTO_BYTES } from './cloud-photo'
import type { DownloadedPhotoFiles, PhotoDownloadPort } from './photo-download-port'

export interface PhotoRestoreDependencies {
  /** Les photos que portent les animaux non supprimés du carnet. */
  carnetPhotos: () => Promise<string[]>
  files: DownloadedPhotoFiles
  downloads: PhotoDownloadPort
  onPhotoRestored?: (fileName: string) => void
}

export interface PhotoRestore {
  /**
   * Télécharge les photos du carnet absentes du téléphone, une par une ; une photo en échec ne
   * retient pas les autres et se retente à l'appel suivant. Ne lève pas.
   */
  restoreMissing(userId: string): Promise<void>
}

export function createPhotoRestore({
  carnetPhotos,
  files,
  downloads,
  onPhotoRestored,
}: PhotoRestoreDependencies): PhotoRestore {
  let running: Promise<void> | null = null

  async function restoreOne(userId: string, fileName: string): Promise<void> {
    if (await files.exists(fileName)) return
    const jpeg = await downloads.download(userId, fileName)
    if (jpeg === null) return
    if (jpeg.length > MAX_CLOUD_PHOTO_BYTES || !isJpeg(jpeg)) {
      console.warn('Photo du cloud trop lourde ou hors JPEG, laissée de côté.')
      return
    }
    await files.write(fileName, jpeg)
    onPhotoRestored?.(fileName)
  }

  async function restoreAll(userId: string): Promise<void> {
    let names: string[]
    try {
      names = (await carnetPhotos()).filter(isPhotoFileName)
    } catch (cause) {
      console.warn('Photos du carnet non relues, nouvel essai plus tard :', errorSummary(cause))
      return
    }
    for (const fileName of names) {
      try {
        await restoreOne(userId, fileName)
      } catch (cause) {
        console.warn('Photo non téléchargée, nouvel essai plus tard :', errorSummary(cause))
      }
    }
  }

  return {
    restoreMissing(userId) {
      running ??= restoreAll(userId).finally(() => {
        running = null
      })
      return running
    },
  }
}
