// @vitest-environment node
import type * as FilesystemModule from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem, type FilesystemPlugin } from '@capacitor/filesystem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteAllPhotos,
  deletePhoto,
  listPhotos,
  photoDisplayUrl,
  photoExists,
  savePhoto,
} from '../photo-storage'

vi.mock('@capacitor/filesystem', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesystemModule>()),
  Filesystem: {
    writeFile: vi.fn<FilesystemPlugin['writeFile']>(),
    deleteFile: vi.fn<FilesystemPlugin['deleteFile']>(),
    rmdir: vi.fn<FilesystemPlugin['rmdir']>(),
    stat: vi.fn<FilesystemPlugin['stat']>(),
    readFile: vi.fn<FilesystemPlugin['readFile']>(),
    readdir: vi.fn<FilesystemPlugin['readdir']>(),
  },
}))

const writeFile = vi.mocked(Filesystem.writeFile)
const deleteFile = vi.mocked(Filesystem.deleteFile)
const rmdir = vi.mocked(Filesystem.rmdir)
const stat = vi.mocked(Filesystem.stat)
const readFile = vi.mocked(Filesystem.readFile)
const readdir = vi.mocked(Filesystem.readdir)

function entry(name: string, type: 'file' | 'directory' = 'file') {
  return { name, type, size: 1, ctime: 0, mtime: 1_700_000_000_000, uri: `file:///data/${name}` }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  readdir.mockReset()
  writeFile.mockResolvedValue({ uri: 'file:///data/photos/x.jpg' })
  deleteFile.mockResolvedValue()
})

describe('savePhoto', () => {
  it('écrit le JPEG sous photos/, dans Directory.Data, en créant le dossier', async () => {
    const name = await savePhoto('QUJD')

    expect(writeFile).toHaveBeenCalledExactlyOnceWith({
      path: `photos/${name}`,
      data: 'QUJD',
      directory: Directory.Data,
      recursive: true,
    })
  })

  it('renvoie un nom de fichier seul, jamais un chemin', async () => {
    const name = await savePhoto('QUJD')

    expect(name).toMatch(/^[0-9a-f-]{36}\.jpg$/)
  })

  it('donne un nom unique à chaque photo', async () => {
    expect(await savePhoto('QUJD')).not.toBe(await savePhoto('QUJD'))
  })

  it('propage un échec d’écriture', async () => {
    writeFile.mockRejectedValue(new Error('disque plein'))

    await expect(savePhoto('QUJD')).rejects.toThrow('disque plein')
  })
})

describe('deletePhoto', () => {
  it('supprime le fichier sous photos/, dans Directory.Data', async () => {
    await deletePhoto('abc.jpg')

    expect(deleteFile).toHaveBeenCalledExactlyOnceWith({
      path: 'photos/abc.jpg',
      directory: Directory.Data,
    })
  })

  it('refuse un nom qui sortirait de photos/', async () => {
    await expect(deletePhoto('../base.db')).rejects.toThrow('Nom de photo invalide')
    expect(deleteFile).not.toHaveBeenCalled()
  })
})

describe('deleteAllPhotos', () => {
  it('supprime le dossier photos/ de Directory.Data et tout son contenu', async () => {
    readdir.mockResolvedValueOnce({ files: [entry('photos', 'directory')] })
    rmdir.mockResolvedValue()

    await deleteAllPhotos()

    expect(rmdir).toHaveBeenCalledExactlyOnceWith({
      path: 'photos',
      directory: Directory.Data,
      recursive: true,
    })
  })

  it('ne tente aucune suppression quand le dossier n’a jamais été créé', async () => {
    readdir.mockResolvedValueOnce({ files: [entry('autre.db'), entry('photos')] })

    await deleteAllPhotos()

    expect(readdir).toHaveBeenCalledExactlyOnceWith({ path: '', directory: Directory.Data })
    expect(rmdir).not.toHaveBeenCalled()
  })

  it('propage un échec de la suppression', async () => {
    readdir.mockResolvedValueOnce({ files: [entry('photos', 'directory')] })
    rmdir.mockRejectedValue(new Error('accès refusé'))

    await expect(deleteAllPhotos()).rejects.toThrow('accès refusé')
  })
})

describe('photoDisplayUrl', () => {
  it('sur Android, convertit l’URI du fichier en URL servie à la WebView', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.spyOn(Capacitor, 'convertFileSrc').mockImplementation(
      (uri) => `https://localhost/_capacitor_file_${uri.replace('file://', '')}`,
    )
    stat.mockResolvedValue({
      uri: 'file:///data/user/0/app/files/photos/abc.jpg',
      type: 'file',
      size: 3,
      ctime: 0,
      mtime: 0,
      name: 'abc.jpg',
    })

    const url = await photoDisplayUrl('abc.jpg')

    expect(stat).toHaveBeenCalledExactlyOnceWith({
      path: 'photos/abc.jpg',
      directory: Directory.Data,
    })
    expect(url).toBe('https://localhost/_capacitor_file_/data/user/0/app/files/photos/abc.jpg')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('sur Android, rejette une photo absente du disque au lieu de rendre une URL cassée', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    const convert = vi.spyOn(Capacitor, 'convertFileSrc')
    stat.mockRejectedValue(new Error('File does not exist'))

    await expect(photoDisplayUrl('restauree.jpg')).rejects.toThrow('File does not exist')
    expect(convert).not.toHaveBeenCalled()
  })

  it('dans le navigateur, relit le fichier en data URL', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
    readFile.mockResolvedValue({ data: 'QUJD' })

    const url = await photoDisplayUrl('abc.jpg')

    expect(readFile).toHaveBeenCalledExactlyOnceWith({
      path: 'photos/abc.jpg',
      directory: Directory.Data,
    })
    expect(url).toBe('data:image/jpeg;base64,QUJD')
  })
})

describe('photoExists', () => {
  it('se contente d’un stat, sans lire le fichier', async () => {
    stat.mockResolvedValue({ uri: 'file:///data/photos/abc.jpg' } as Awaited<
      ReturnType<FilesystemPlugin['stat']>
    >)

    await expect(photoExists('abc.jpg')).resolves.toBe(true)
    expect(stat).toHaveBeenCalledExactlyOnceWith({
      path: 'photos/abc.jpg',
      directory: Directory.Data,
    })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('répond faux pour un fichier absent comme pour un nom invalide', async () => {
    stat.mockRejectedValue(new Error('File does not exist'))

    await expect(photoExists('absente.jpg')).resolves.toBe(false)
    await expect(photoExists('../secrets.txt')).resolves.toBe(false)
  })
})

describe('listPhotos', () => {
  it('rend les seules photos de l’app rangées sous photos/', async () => {
    readdir
      .mockResolvedValueOnce({ files: [entry('photos', 'directory'), entry('autre.db')] })
      .mockResolvedValueOnce({
        files: [
          entry('3f2b-a1.jpg'),
          entry('notes.txt'),
          entry('sous-dossier.jpg', 'directory'),
          entry('.cache.jpg'),
          entry('photo.png'),
        ],
      })

    expect(await listPhotos()).toEqual([{ name: '3f2b-a1.jpg', modifiedAt: 1_700_000_000_000 }])
    expect(readdir).toHaveBeenLastCalledWith({ path: 'photos', directory: Directory.Data })
  })

  it('ne lit pas photos/ tant qu’aucune photo n’a été enregistrée', async () => {
    readdir.mockResolvedValueOnce({ files: [entry('autre.db')] })

    expect(await listPhotos()).toEqual([])
    expect(readdir).toHaveBeenCalledExactlyOnceWith({ path: '', directory: Directory.Data })
  })
})
