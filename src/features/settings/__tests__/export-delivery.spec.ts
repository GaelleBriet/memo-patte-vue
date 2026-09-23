import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem, type FileInfo } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearExports, deliverExportFile } from '../logic/export-delivery'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn<() => boolean>(() => true) },
}))

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    deleteFile: vi.fn<() => Promise<void>>(async () => {}),
    rmdir: vi.fn<() => Promise<void>>(async () => {}),
    stat: vi.fn<(options: { path: string }) => Promise<object>>(async ({ path }) => {
      throw new Error(`File does not exist at ${path}`)
    }),
    writeFile: vi.fn<(options: { path: string }) => Promise<{ uri: string }>>(async ({ path }) => ({
      uri: `file:///cache/${path}`,
    })),
  },
}))

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn<() => Promise<{ activityType: string }>>(async () => ({
      activityType: 'com.google.android.gm',
    })),
  },
}))

const FILE_INFO: FileInfo = { name: 'x', type: 'file', size: 2, mtime: 0, uri: 'file:///x' }

function pluginError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

function writtenPaths(): string[] {
  return vi.mocked(Filesystem.writeFile).mock.calls.map(([options]) => options.path)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
})

describe('deliverExportFile — partager', () => {
  it('écrit un JSON en UTF-8 dans le cache de l’app puis ouvre la feuille de partage', async () => {
    await expect(
      deliverExportFile(
        { name: 'memopatte-export-20260915-1030.json', content: '{}' },
        'share',
        'Partager via',
      ),
    ).resolves.toBe('shared')

    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'exports/memopatte-export-20260915-1030.json',
      data: '{}',
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    expect(Share.share).toHaveBeenCalledWith({
      files: ['file:///cache/exports/memopatte-export-20260915-1030.json'],
      dialogTitle: 'Partager via',
    })
  })

  it('écrit une archive en base64, sans encodage texte', async () => {
    await deliverExportFile(
      {
        name: 'memopatte-export-20260915-1030.zip',
        content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      },
      'share',
      'Partager via',
    )

    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'exports/memopatte-export-20260915-1030.zip',
      data: 'UEsDBA==',
      directory: Directory.Cache,
      recursive: true,
    })
  })

  it('efface les exports précédents avant d’écrire, même s’il n’y en a aucun', async () => {
    vi.mocked(Filesystem.rmdir).mockRejectedValueOnce(new Error('Folder does not exist.'))

    await deliverExportFile({ name: 'a.json', content: '{}' }, 'share', 'Partager via')

    expect(Filesystem.rmdir).toHaveBeenCalledWith({
      path: 'exports',
      directory: Directory.Cache,
      recursive: true,
    })
    expect(vi.mocked(Filesystem.rmdir).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(Filesystem.writeFile).mock.invocationCallOrder[0]!,
    )
  })

  it('renvoie « cancelled » quand la feuille de partage est fermée sans choix', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share canceled'))

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'share', 'x')).resolves.toBe(
      'cancelled',
    )
  })

  it('lève sur toute autre erreur', async () => {
    vi.mocked(Filesystem.writeFile).mockRejectedValueOnce(new Error('disque plein'))

    await expect(
      deliverExportFile({ name: 'a.json', content: '{}' }, 'share', 'x'),
    ).rejects.toThrow('disque plein')
  })

  // Le partage rend la main quand l'app revient au premier plan, pas quand le destinataire a fini
  // de lire l'URI : Gmail, Drive ou Quick Share enverraient une pièce jointe vide.
  it('laisse le fichier en place après un partage accepté', async () => {
    await deliverExportFile({ name: 'a.json', content: '{}' }, 'share', 'x')

    expect(Filesystem.rmdir).toHaveBeenCalledOnce()
    expect(vi.mocked(Filesystem.rmdir).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(Filesystem.writeFile).mock.invocationCallOrder[0]!,
    )
  })

  it('ne laisse pas le carnet dans le cache quand le partage est annulé', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share canceled'))

    await deliverExportFile({ name: 'a.json', content: '{}' }, 'share', 'x')

    expect(Filesystem.rmdir).toHaveBeenCalledTimes(2)
  })

  it('ne laisse pas le carnet dans le cache quand le partage échoue', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Activity not found'))

    await expect(
      deliverExportFile({ name: 'a.json', content: '{}' }, 'share', 'x'),
    ).rejects.toThrow('Activity not found')
    expect(Filesystem.rmdir).toHaveBeenCalledTimes(2)
  })

  it('renvoie « cancelled » même si l’effacement échoue', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share canceled'))
    vi.mocked(Filesystem.rmdir).mockResolvedValueOnce().mockRejectedValueOnce(new Error('occupé'))

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'share', 'x')).resolves.toBe(
      'cancelled',
    )
  })
})

describe('deliverExportFile — enregistrer sur le téléphone', () => {
  it('écrit un JSON en UTF-8 dans Documents › MémoPatte, sans feuille de partage', async () => {
    await expect(
      deliverExportFile(
        { name: 'memopatte-export-20260923-1432.json', content: '{}' },
        'save',
        'Partager via',
      ),
    ).resolves.toBe('saved')

    expect(Filesystem.writeFile).toHaveBeenCalledExactlyOnceWith({
      path: 'MémoPatte/memopatte-export-20260923-1432.json',
      data: '{}',
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    expect(Share.share).not.toHaveBeenCalled()
    expect(Filesystem.rmdir).not.toHaveBeenCalled()
  })

  it('écrit un PDF en base64, sans encodage texte', async () => {
    await deliverExportFile(
      { name: 'carnet-milo-20260923-1432.pdf', content: new Uint8Array([0x25, 0x50, 0x44, 0x46]) },
      'save',
      'x',
    )

    expect(Filesystem.writeFile).toHaveBeenCalledExactlyOnceWith({
      path: 'MémoPatte/carnet-milo-20260923-1432.pdf',
      data: 'JVBERg==',
      directory: Directory.Documents,
      recursive: true,
    })
  })

  it('ne remplace jamais un export de la même minute : le nouveau prend un numéro', async () => {
    vi.mocked(Filesystem.stat).mockImplementation(async ({ path }) => {
      if (path === 'MémoPatte/memopatte-export-20260923-1432.json') return FILE_INFO
      throw new Error('File does not exist')
    })

    await expect(
      deliverExportFile(
        { name: 'memopatte-export-20260923-1432.json', content: '{}' },
        'save',
        'x',
      ),
    ).resolves.toBe('saved')

    expect(writtenPaths()).toEqual(['MémoPatte/memopatte-export-20260923-1432 (1).json'])
    expect(Filesystem.stat).toHaveBeenCalledWith({
      path: 'MémoPatte/memopatte-export-20260923-1432.json',
      directory: Directory.Documents,
    })
  })

  it('remonte une vraie panne au premier essai et efface le fichier entamé', async () => {
    vi.mocked(Filesystem.writeFile).mockRejectedValue(
      pluginError("'writeFile' failed with: ENOSPC (No space left on device)", 'OS-PLUG-FILE-0013'),
    )

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'save', 'x')).rejects.toThrow(
      'No space left on device',
    )
    expect(writtenPaths()).toEqual(['MémoPatte/a.json'])
    expect(Filesystem.deleteFile).toHaveBeenCalledExactlyOnceWith({
      path: 'MémoPatte/a.json',
      directory: Directory.Documents,
    })
  })

  it('remonte la panne d’écriture même si l’effacement échoue aussi', async () => {
    vi.mocked(Filesystem.writeFile).mockRejectedValue(new Error('No space left on device'))
    vi.mocked(Filesystem.deleteFile).mockRejectedValue(new Error('File does not exist'))

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'save', 'x')).rejects.toThrow(
      'No space left on device',
    )
  })

  it('lève sans rien effacer quand l’accès au stockage est refusé, pour ne pas redemander', async () => {
    vi.mocked(Filesystem.writeFile).mockRejectedValue(
      pluginError(
        'Unable to do file operation, user denied permission request.',
        'OS-PLUG-FILE-0007',
      ),
    )

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'save', 'x')).rejects.toThrow(
      'user denied permission request',
    )
    expect(Filesystem.writeFile).toHaveBeenCalledOnce()
    expect(Filesystem.deleteFile).not.toHaveBeenCalled()
  })

  it('lève sans rien écrire quand tous les numéros sont déjà pris', async () => {
    vi.mocked(Filesystem.stat).mockResolvedValue(FILE_INFO)

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'save', 'x')).rejects.toThrow(
      'Aucun nom libre',
    )
    expect(Filesystem.stat).toHaveBeenLastCalledWith({
      path: 'MémoPatte/a (99).json',
      directory: Directory.Documents,
    })
    expect(Filesystem.writeFile).not.toHaveBeenCalled()
  })

  describe('dans le navigateur', () => {
    let clicked: { href: string; download: string }[]

    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
      clicked = []
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicked.push({ href: this.href, download: this.download })
      })
      URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:http://localhost/export')
      URL.revokeObjectURL = vi.fn<(url: string) => void>()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('télécharge le fichier sous son nom, sans toucher au stockage', async () => {
      await expect(
        deliverExportFile(
          { name: 'memopatte-export-20260923-1432.json', content: '{}' },
          'save',
          'x',
        ),
      ).resolves.toBe('saved')

      expect(clicked).toEqual([
        { href: 'blob:http://localhost/export', download: 'memopatte-export-20260923-1432.json' },
      ])
      const [blob] = vi.mocked(URL.createObjectURL).mock.calls[0]! as [Blob]
      await expect(blob.text()).resolves.toBe('{}')
      expect(Filesystem.writeFile).not.toHaveBeenCalled()
      expect(Filesystem.stat).not.toHaveBeenCalled()
    })
  })
})

describe('clearExports', () => {
  it('vide le dossier des exports, même vide ou absent', async () => {
    vi.mocked(Filesystem.rmdir).mockRejectedValueOnce(new Error('Folder does not exist.'))

    await expect(clearExports()).resolves.toBeUndefined()
    expect(Filesystem.rmdir).toHaveBeenCalledExactlyOnceWith({
      path: 'exports',
      directory: Directory.Cache,
      recursive: true,
    })
  })
})
