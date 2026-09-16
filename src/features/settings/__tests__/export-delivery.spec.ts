import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearExports, deliverExportFile } from '../export-delivery'

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    rmdir: vi.fn<() => Promise<void>>(async () => {}),
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('deliverExportFile', () => {
  it('écrit un JSON en UTF-8 dans le cache de l’app puis ouvre la feuille de partage', async () => {
    await expect(
      deliverExportFile(
        { name: 'memopatte-export-2026-09-15.json', content: '{}' },
        'Partager via',
      ),
    ).resolves.toBe('shared')

    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'exports/memopatte-export-2026-09-15.json',
      data: '{}',
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    expect(Share.share).toHaveBeenCalledWith({
      files: ['file:///cache/exports/memopatte-export-2026-09-15.json'],
      dialogTitle: 'Partager via',
    })
  })

  it('écrit une archive en base64, sans encodage texte', async () => {
    await deliverExportFile(
      {
        name: 'memopatte-export-2026-09-15.zip',
        content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      },
      'Partager via',
    )

    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'exports/memopatte-export-2026-09-15.zip',
      data: 'UEsDBA==',
      directory: Directory.Cache,
      recursive: true,
    })
  })

  it('efface les exports précédents avant d’écrire, même s’il n’y en a aucun', async () => {
    vi.mocked(Filesystem.rmdir).mockRejectedValueOnce(new Error('Folder does not exist.'))

    await deliverExportFile({ name: 'a.json', content: '{}' }, 'Partager via')

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

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'x')).resolves.toBe(
      'cancelled',
    )
  })

  it('lève sur toute autre erreur', async () => {
    vi.mocked(Filesystem.writeFile).mockRejectedValueOnce(new Error('disque plein'))

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'x')).rejects.toThrow(
      'disque plein',
    )
  })

  // Le partage rend la main quand l'app revient au premier plan, pas quand le destinataire a fini
  // de lire l'URI : Gmail, Drive ou Quick Share enverraient une pièce jointe vide.
  it('laisse le fichier en place après un partage accepté', async () => {
    await deliverExportFile({ name: 'a.json', content: '{}' }, 'x')

    expect(Filesystem.rmdir).toHaveBeenCalledOnce()
    expect(vi.mocked(Filesystem.rmdir).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(Filesystem.writeFile).mock.invocationCallOrder[0]!,
    )
  })

  it('ne laisse pas le carnet dans le cache quand le partage est annulé', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share canceled'))

    await deliverExportFile({ name: 'a.json', content: '{}' }, 'x')

    expect(Filesystem.rmdir).toHaveBeenCalledTimes(2)
  })

  it('ne laisse pas le carnet dans le cache quand le partage échoue', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Activity not found'))

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'x')).rejects.toThrow(
      'Activity not found',
    )
    expect(Filesystem.rmdir).toHaveBeenCalledTimes(2)
  })

  it('renvoie « cancelled » même si l’effacement échoue', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share canceled'))
    vi.mocked(Filesystem.rmdir).mockResolvedValueOnce().mockRejectedValueOnce(new Error('occupé'))

    await expect(deliverExportFile({ name: 'a.json', content: '{}' }, 'x')).resolves.toBe(
      'cancelled',
    )
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
