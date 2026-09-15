// @vitest-environment node
import type * as CameraModule from '@capacitor/camera'
import { Camera, MediaTypeSelection, type CameraPlugin } from '@capacitor/camera'
import { CapacitorException, ExceptionCode } from '@capacitor/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PHOTO_SIZE_PX, pickPhoto } from '../photo-picker'
import { squareJpegBase64 } from '../image-resize'

vi.mock('@capacitor/camera', async (importOriginal) => ({
  ...(await importOriginal<typeof CameraModule>()),
  Camera: { chooseFromGallery: vi.fn<CameraPlugin['chooseFromGallery']>() },
}))

vi.mock('../image-resize', () => ({
  squareJpegBase64: vi.fn<(src: string, size: number) => Promise<string>>(),
}))

const chooseFromGallery = vi.mocked(Camera.chooseFromGallery)
const resize = vi.mocked(squareJpegBase64)

beforeEach(() => {
  vi.clearAllMocks()
  resize.mockResolvedValue('UkVTSVpFRA==')
})

function photo(webPath: string) {
  return { type: 0, saved: false, webPath }
}

describe('pickPhoto', () => {
  it('ouvre le sélecteur système pour une seule photo, sans édition', async () => {
    chooseFromGallery.mockResolvedValue({ results: [photo('blob:milo')] })

    await pickPhoto()

    expect(chooseFromGallery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        editable: 'no',
        webUseInput: true,
      }),
    )
  })

  it('redimensionne la photo choisie avant de la rendre', async () => {
    chooseFromGallery.mockResolvedValue({ results: [photo('blob:milo')] })

    const picked = await pickPhoto()

    expect(resize).toHaveBeenCalledExactlyOnceWith('blob:milo', PHOTO_SIZE_PX)
    expect(picked).toEqual({
      base64: 'UkVTSVpFRA==',
      previewUrl: 'data:image/jpeg;base64,UkVTSVpFRA==',
    })
  })

  it('rend null quand l’utilisateur ferme le sélecteur sans choisir', async () => {
    chooseFromGallery.mockRejectedValue(new CapacitorException('User cancelled photos app'))

    expect(await pickPhoto()).toBeNull()
    expect(resize).not.toHaveBeenCalled()
  })

  it('rend null sur l’annulation Android, qui arrive avec son propre message', async () => {
    chooseFromGallery.mockRejectedValue(
      Object.assign(
        new Error("Couldn't choose media from the gallery because the process was canceled."),
        {
          code: 'OS-PLUG-CAMR-0020',
        },
      ),
    )

    expect(await pickPhoto()).toBeNull()
  })

  it('rend null si le sélecteur ne renvoie aucune photo', async () => {
    chooseFromGallery.mockResolvedValue({ results: [] })

    expect(await pickPhoto()).toBeNull()
  })

  it('propage toute autre erreur', async () => {
    chooseFromGallery.mockRejectedValue(
      new CapacitorException('Not implemented', ExceptionCode.Unimplemented),
    )

    await expect(pickPhoto()).rejects.toThrow('Not implemented')
  })
})
