import { isPhotoFileName } from '@/core/photos/photo-storage'
import { errorSummary } from '@/shared/utils/error-summary'
import { isJpeg, MAX_CLOUD_PHOTO_BYTES } from './cloud-photo'
import type { DownloadedPhotoFiles, PhotoDownloadPort } from './photo-download-port'

export interface PhotoRestoreDependencies {
  /** Les photos que portent les animaux non supprimés du carnet. */
  carnetPhotos: () => Promise<string[]>
  files: DownloadedPhotoFiles
  downloads: PhotoDownloadPort
  /** Faux dès que le compte de la passe n'est plus celui du téléphone, ou que sa session est finie. */
  isAccountCurrent: (userId: string) => boolean
  onPhotoRestored?: (fileName: string) => void
}

export interface PhotoRestore {
  /**
   * Télécharge les photos du carnet absentes du téléphone, une par une ; une photo en échec ne
   * retient pas les autres et se retente à l'appel suivant. Une passe pour un autre compte suit
   * celle en cours, qui s'arrête à la photo suivante. Ne lève pas.
   */
  restoreMissing(userId: string): Promise<void>
}

export function createPhotoRestore({
  carnetPhotos,
  files,
  downloads,
  isAccountCurrent,
  onPhotoRestored,
}: PhotoRestoreDependencies): PhotoRestore {
  let running: { userId: string; done: Promise<void> } | null = null

  async function restoreOne(userId: string, fileName: string): Promise<void> {
    if (await files.exists(fileName)) return
    if (!isAccountCurrent(userId)) return
    const jpeg = await downloads.download(userId, fileName)
    if (jpeg === null || !isAccountCurrent(userId)) return
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
      if (!isAccountCurrent(userId)) return
      try {
        await restoreOne(userId, fileName)
      } catch (cause) {
        console.warn('Photo non téléchargée, nouvel essai plus tard :', errorSummary(cause))
      }
    }
  }

  return {
    restoreMissing(userId) {
      if (running?.userId === userId) return running.done
      const previous = running?.done ?? Promise.resolve()
      const done: Promise<void> = previous
        .then(() => restoreAll(userId))
        .catch((cause: unknown) => {
          console.warn(
            'Photos du compte non restaurées, nouvel essai plus tard :',
            errorSummary(cause),
          )
        })
        .finally(() => {
          if (running?.done === done) running = null
        })
      running = { userId, done }
      return done
    },
  }
}
