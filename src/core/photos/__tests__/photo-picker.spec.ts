// @vitest-environment node
import type * as CameraModule from '@capacitor/camera'
import type * as FilesystemModule from '@capacitor/filesystem'
import { Camera, MediaTypeSelection, type CameraPlugin } from '@capacitor/camera'
import { CapacitorException, ExceptionCode } from '@capacitor/core'
import { Directory, Filesystem, type FilesystemPlugin } from '@capacitor/filesystem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PHOTO_SIZE_PX, pickPhoto } from '../photo-picker'
import { squareJpegBase64 } from '../image-resize'

vi.mock('@capacitor/camera', async (importOriginal) => ({
  ...(await importOriginal<typeof CameraModule>()),
  Camera: { chooseFromGallery: vi.fn<CameraPlugin['chooseFromGallery']>() },
}))

vi.mock('@capacitor/filesystem', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesystemModule>()),
  Filesystem: {
    getUri: vi.fn<FilesystemPlugin['getUri']>(),
    deleteFile: vi.fn<FilesystemPlugin['deleteFile']>(),
  },
}))

vi.mock('../image-resize', () => ({
  squareJpegBase64: vi.fn<(src: string, size: number) => Promise<string>>(),
}))

const chooseFromGallery = vi.mocked(Camera.chooseFromGallery)
const resize = vi.mocked(squareJpegBase64)
const getUri = vi.mocked(Filesystem.getUri)
const deleteFile = vi.mocked(Filesystem.deleteFile)

const CACHE = 'file:///data/user/0/com.gaellebriet.memopatte/cache'

beforeEach(() => {
  vi.clearAllMocks()
  resize.mockResolvedValue('UkVTSVpFRA==')
  getUri.mockResolvedValue({ uri: CACHE })
  deleteFile.mockResolvedValue()
})

function photo(webPath: string, uri?: string) {
  return { type: 0, saved: false, webPath, uri }
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

  it('supprime la copie que le plugin a laissée dans le cache, une fois recadrée', async () => {
    const copie = '/data/user/0/com.gaellebriet.memopatte/cache/IMG_1.jpg'
    chooseFromGallery.mockResolvedValue({
      results: [photo('https://localhost/_capacitor_file_x', copie)],
    })

    await pickPhoto()

    expect(getUri).toHaveBeenCalledWith({ path: '', directory: Directory.Cache })
    expect(deleteFile).toHaveBeenCalledExactlyOnceWith({ path: copie })
  })

  it('supprime aussi la copie en cache quand le recadrage échoue', async () => {
    const copie = `${CACHE}/IMG_2.jpg`
    chooseFromGallery.mockResolvedValue({ results: [photo('https://localhost/x', copie)] })
    resize.mockRejectedValue(new Error('Image illisible'))

    await expect(pickPhoto()).rejects.toThrow('Image illisible')
    expect(deleteFile).toHaveBeenCalledExactlyOnceWith({ path: copie })
  })

  it('ne supprime jamais un fichier hors du cache de l’app', async () => {
    chooseFromGallery.mockResolvedValue({
      results: [photo('https://localhost/x', '/storage/emulated/0/DCIM/IMG_3.jpg')],
    })

    await pickPhoto()

    expect(deleteFile).not.toHaveBeenCalled()
  })

  it('ne supprime rien dans le navigateur, où le plugin ne rend pas d’URI', async () => {
    chooseFromGallery.mockResolvedValue({ results: [photo('blob:milo')] })

    await pickPhoto()

    expect(deleteFile).not.toHaveBeenCalled()
  })

  it('ne fait pas échouer le choix si la copie en cache ne peut pas être supprimée', async () => {
    chooseFromGallery.mockResolvedValue({
      results: [photo('https://localhost/x', `${CACHE}/IMG_4.jpg`)],
    })
    deleteFile.mockRejectedValue(new Error('verrouillé'))

    expect(await pickPhoto()).not.toBeNull()
  })
})
