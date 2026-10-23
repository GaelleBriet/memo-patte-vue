// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DownloadedPhotoFiles, PhotoDownloadPort } from '../service/photo-download-port'
import { createPhotoRestore } from '../service/photo-restore'

const MILO_PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

function setup(options: { carnetPhotos?: () => Promise<string[]> } = {}) {
  const waiting: Array<(bytes: Uint8Array | null) => void> = []
  const failure: { cause: unknown } = { cause: null }
  const stored = new Map<string, Uint8Array>()
  const downloads: PhotoDownloadPort = {
    download: () => {
      if (failure.cause !== null) return Promise.reject(failure.cause)
      return new Promise((resolve) => waiting.push(resolve))
    },
  }
  const files: DownloadedPhotoFiles = {
    exists: async (name) => stored.has(name),
    write: async (name, bytes) => {
      stored.set(name, bytes)
    },
  }
  const account = { current: 'user-A' }
  const restore = createPhotoRestore({
    carnetPhotos: options.carnetPhotos ?? (async () => [MILO_PHOTO]),
    files,
    downloads,
    isAccountCurrent: (userId) => account.current === userId,
  })
  return { restore, waiting, failure, account }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('état de la restauration des photos', () => {
  it('au repos tant qu’aucune passe n’a été lancée', () => {
    expect(setup().restore.isRunning.value).toBe(false)
  })

  it('Milo : en cours dès le lancement de la passe, au repos quand sa photo est arrivée', async () => {
    const { restore, waiting } = setup()

    const pass = restore.restoreMissing('user-A')
    expect(restore.isRunning.value).toBe(true)
    await settle()
    expect(restore.isRunning.value).toBe(true)

    waiting.shift()?.(JPEG)
    await pass
    expect(restore.isRunning.value).toBe(false)
  })

  it('au repos après un échec de téléchargement', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { restore, failure } = setup()
    failure.cause = new Error('réseau lent')

    await restore.restoreMissing('user-A')

    expect(restore.isRunning.value).toBe(false)
  })

  it('au repos quand les photos du carnet ne se relisent pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { restore } = setup({ carnetPhotos: () => Promise.reject(new Error('base')) })

    await restore.restoreMissing('user-A')

    expect(restore.isRunning.value).toBe(false)
  })

  it('au repos quand le compte change pendant la passe', async () => {
    const { restore, waiting, account } = setup()

    const pass = restore.restoreMissing('user-A')
    await settle()
    account.current = 'user-B'
    waiting.shift()?.(JPEG)
    await pass

    expect(restore.isRunning.value).toBe(false)
  })

  it('reste en cours tant que la passe du nouveau compte tourne', async () => {
    const { restore, waiting, account } = setup()

    const first = restore.restoreMissing('user-A')
    account.current = 'user-B'
    const second = restore.restoreMissing('user-B')
    await settle()
    waiting.shift()?.(JPEG)
    await first
    expect(restore.isRunning.value).toBe(true)

    await settle()
    waiting.shift()?.(JPEG)
    await second
    expect(restore.isRunning.value).toBe(false)
  })
})
