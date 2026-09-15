import { Camera, MediaTypeSelection } from '@capacitor/camera'
import { Directory, Filesystem } from '@capacitor/filesystem'

import { squareJpegBase64 } from './image-resize'

/** Côté du carré stocké : l'avatar le plus grand fait 88 px, soit 264 px en densité ×3. */
export const PHOTO_SIZE_PX = 512

const ANDROID_CANCELLED_CODE = 'OS-PLUG-CAMR-0020'

export interface PickedPhoto {
  base64: string
  previewUrl: string
}

function isCancellation(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false
  const code = (cause as Error & { code?: unknown }).code
  return code === ANDROID_CANCELLED_CODE || /cancel/i.test(cause.message)
}

function withoutScheme(uri: string): string {
  return uri.replace(/^file:\/\//, '')
}

// Le plugin copie la photo choisie dans le cache de l'app et ne la supprime jamais.
async function discardPluginCopy(uri: string | undefined): Promise<void> {
  if (!uri) return
  try {
    const cache = await Filesystem.getUri({ path: '', directory: Directory.Cache })
    if (withoutScheme(uri).startsWith(withoutScheme(cache.uri))) {
      await Filesystem.deleteFile({ path: uri })
    }
  } catch {
    // Le système vide le cache de lui-même : un échec ici ne doit pas bloquer le choix.
  }
}

/** Photo Picker système, sans permission de lecture des médias. `null` si rien n'est choisi. */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  let webPath: string | undefined
  let uri: string | undefined

  try {
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: false,
      editable: 'no',
      webUseInput: true,
    })
    webPath = results[0]?.webPath
    uri = results[0]?.uri
  } catch (cause) {
    if (isCancellation(cause)) return null
    throw cause
  }

  if (!webPath) {
    await discardPluginCopy(uri)
    return null
  }

  try {
    const base64 = await squareJpegBase64(webPath, PHOTO_SIZE_PX)
    return { base64, previewUrl: `data:image/jpeg;base64,${base64}` }
  } finally {
    await discardPluginCopy(uri)
  }
}
