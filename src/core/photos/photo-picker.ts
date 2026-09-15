import { Camera, MediaTypeSelection } from '@capacitor/camera'

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

/** Photo Picker système, sans permission de lecture des médias. `null` si rien n'est choisi. */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  let webPath: string | undefined

  try {
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: false,
      editable: 'no',
      webUseInput: true,
    })
    webPath = results[0]?.webPath
  } catch (cause) {
    if (isCancellation(cause)) return null
    throw cause
  }

  if (!webPath) return null

  const base64 = await squareJpegBase64(webPath, PHOTO_SIZE_PX)
  return { base64, previewUrl: `data:image/jpeg;base64,${base64}` }
}
