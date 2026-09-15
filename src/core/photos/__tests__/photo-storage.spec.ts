// @vitest-environment node
import type * as FilesystemModule from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem, type FilesystemPlugin } from '@capacitor/filesystem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deletePhoto, photoDisplayUrl, savePhoto } from '../photo-storage'

vi.mock('@capacitor/filesystem', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesystemModule>()),
  Filesystem: {
    writeFile: vi.fn<FilesystemPlugin['writeFile']>(),
    deleteFile: vi.fn<FilesystemPlugin['deleteFile']>(),
    stat: vi.fn<FilesystemPlugin['stat']>(),
    readFile: vi.fn<FilesystemPlugin['readFile']>(),
  },
}))

const writeFile = vi.mocked(Filesystem.writeFile)
const deleteFile = vi.mocked(Filesystem.deleteFile)
const stat = vi.mocked(Filesystem.stat)
const readFile = vi.mocked(Filesystem.readFile)

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
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
