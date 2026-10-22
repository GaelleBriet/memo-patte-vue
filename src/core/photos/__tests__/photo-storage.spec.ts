// @vitest-environment node
import type * as FilesystemModule from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem, type FilesystemPlugin } from '@capacitor/filesystem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteAllPhotos,
  deletePhoto,
  isPhotoFileName,
  listPhotos,
  photoDisplayUrl,
  photoExists,
  readPhoto,
  savePhoto,
  writeDownloadedPhoto,
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
    rename: vi.fn<FilesystemPlugin['rename']>(),
  },
}))

const writeFile = vi.mocked(Filesystem.writeFile)
const deleteFile = vi.mocked(Filesystem.deleteFile)
const rmdir = vi.mocked(Filesystem.rmdir)
const stat = vi.mocked(Filesystem.stat)
const readFile = vi.mocked(Filesystem.readFile)
const readdir = vi.mocked(Filesystem.readdir)
const rename = vi.mocked(Filesystem.rename)

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

describe('writeDownloadedPhoto', () => {
  const PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

  it('écrit sous un nom provisoire de photos/, puis le renomme : jamais un fichier tronqué sous le nom de la photo', async () => {
    const calls: string[] = []
    writeFile.mockImplementation(async ({ path }) => {
      calls.push(`écrit ${path}`)
      return { uri: `file:///data/${path}` }
    })
    rename.mockImplementation(async ({ from, to }) => {
      calls.push(`renomme ${from} en ${to}`)
    })

    await writeDownloadedPhoto(PHOTO, JPEG)

    expect(calls).toEqual([
      `écrit photos/${PHOTO}.part`,
      `renomme photos/${PHOTO}.part en photos/${PHOTO}`,
    ])
    expect(writeFile).toHaveBeenCalledExactlyOnceWith({
      path: `photos/${PHOTO}.part`,
      data: btoa('\xff\xd8\xff\xe0'),
      directory: Directory.Data,
      recursive: true,
    })
    expect(rename).toHaveBeenCalledExactlyOnceWith({
      from: `photos/${PHOTO}.part`,
      to: `photos/${PHOTO}`,
      directory: Directory.Data,
      toDirectory: Directory.Data,
    })
  })

  it('le nom provisoire n’est pas un nom de photo : la liste des photos l’ignore', () => {
    expect(isPhotoFileName(`${PHOTO}.part`)).toBe(false)
  })

  it('encode à l’identique une photo de 2 Mio', async () => {
    const big = new Uint8Array(2 * 1024 * 1024)
    for (let index = 0; index < big.length; index++) big[index] = index % 251

    await writeDownloadedPhoto(PHOTO, big)

    const written = Buffer.from(String(writeFile.mock.calls[0]?.[0].data), 'base64')
    expect(written.equals(Buffer.from(big))).toBe(true)
  })

  it('ne renomme rien quand l’écriture échoue, et propage l’échec', async () => {
    writeFile.mockRejectedValue(new Error('disque plein'))

    await expect(writeDownloadedPhoto(PHOTO, JPEG)).rejects.toThrow('disque plein')
    expect(rename).not.toHaveBeenCalled()
  })

  it('refuse un nom qui sortirait de photos/, sans rien écrire', async () => {
    await expect(writeDownloadedPhoto('../base.db', JPEG)).rejects.toThrow('Nom de photo invalide')
    expect(writeFile).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
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

describe('readPhoto', () => {
  const MAX = 2 * 1024 * 1024
  const statOf = (size: number) =>
    ({ uri: 'file:///data/photos/abc.jpg', size }) as Awaited<ReturnType<FilesystemPlugin['stat']>>

  it('rend les octets du fichier lu sous photos/, dans Directory.Data', async () => {
    stat.mockResolvedValue(statOf(4))
    readFile.mockResolvedValue({ data: btoa('\xff\xd8\xff\xe0') })

    await expect(readPhoto('abc.jpg', MAX)).resolves.toEqual({
      kind: 'found',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    })
    expect(readFile).toHaveBeenCalledExactlyOnceWith({
      path: 'photos/abc.jpg',
      directory: Directory.Data,
    })
  })

  it('rend aussi les octets d’un fichier que le navigateur relit en Blob', async () => {
    stat.mockResolvedValue(statOf(3))
    readFile.mockResolvedValue({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff])]) })

    await expect(readPhoto('abc.jpg', MAX)).resolves.toEqual({
      kind: 'found',
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
    })
  })

  it('lit un fichier de la taille maximale pile', async () => {
    stat.mockResolvedValue(statOf(MAX))
    readFile.mockResolvedValue({ data: btoa('\xff\xd8\xff') })

    await expect(readPhoto('abc.jpg', MAX)).resolves.toMatchObject({ kind: 'found' })
  })

  it('ne lit pas un fichier plus lourd que la taille maximale', async () => {
    stat.mockResolvedValue(statOf(MAX + 1))

    await expect(readPhoto('abc.jpg', MAX)).resolves.toEqual({ kind: 'too-large' })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('rend absent, sans rien lire, un fichier qui n’existe pas', async () => {
    stat.mockRejectedValue(new Error('File does not exist'))

    await expect(readPhoto('absente.jpg', MAX)).resolves.toEqual({ kind: 'absent' })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('rend absent, sans rien lire, un nom qui sortirait de photos/', async () => {
    stat.mockResolvedValue(statOf(4))

    await expect(readPhoto('../secrets.txt', MAX)).resolves.toEqual({ kind: 'absent' })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('propage un échec de lecture d’un fichier présent', async () => {
    stat.mockResolvedValue(statOf(4))
    readFile.mockRejectedValue(new Error('lecture impossible'))

    await expect(readPhoto('abc.jpg', MAX)).rejects.toThrow('lecture impossible')
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
