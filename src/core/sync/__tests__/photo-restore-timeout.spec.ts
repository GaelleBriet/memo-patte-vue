// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAnimalPhotoDownload } from '@/core/supabase/animal-photo-download'
import type { DownloadedPhotoFiles } from '../service/photo-download-port'
import { createPhotoRestore } from '../service/photo-restore'

const MILO_PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

function setup() {
  const silentUsers = new Set<string>()
  const asked: string[] = []
  const download = vi.fn<(path: string) => Promise<{ data: Blob; error: null }>>((path) => {
    asked.push(path)
    if (silentUsers.has(path.split('/')[0] ?? '')) return new Promise(() => {})
    return Promise.resolve({ data: new Blob([JPEG]), error: null })
  })
  const client = { storage: { from: () => ({ download }) } } as unknown as SupabaseClient
  const stored = new Map<string, Uint8Array>()
  const files: DownloadedPhotoFiles = {
    exists: async (name) => stored.has(name),
    write: async (name, bytes) => {
      stored.set(name, bytes)
    },
  }
  const account = { current: 'user-A' }
  const restore = createPhotoRestore({
    carnetPhotos: async () => [MILO_PHOTO],
    files,
    downloads: createAnimalPhotoDownload(async () => client),
    isAccountCurrent: (userId) => account.current === userId,
  })
  return { silentUsers, asked, stored, account, restore }
}

function track(promise: Promise<void>) {
  const outcome = { settled: false }
  void promise.then(() => (outcome.settled = true))
  return outcome
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('restauration des photos face à un serveur muet', () => {
  it('Milo : le téléchargement ne répond jamais — la passe se termine à 60 s et l’appel suivant réessaie', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { silentUsers, asked, stored, restore } = setup()
    silentUsers.add('user-A')

    const pass = track(restore.restoreMissing('user-A'))
    await vi.advanceTimersByTimeAsync(59_900)
    expect(pass.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(100)
    expect(pass.settled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    silentUsers.clear()
    await restore.restoreMissing('user-A')

    expect(asked).toEqual([`user-A/${MILO_PHOTO}`, `user-A/${MILO_PHOTO}`])
    expect(stored.get(MILO_PHOTO)).toEqual(JPEG)
  })

  it('le compte change pendant un téléchargement muet du compte A — la passe du compte B part à 60 s', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { silentUsers, asked, stored, account, restore } = setup()
    silentUsers.add('user-A')

    const first = track(restore.restoreMissing('user-A'))
    await vi.advanceTimersByTimeAsync(0)
    account.current = 'user-B'
    const second = track(restore.restoreMissing('user-B'))

    await vi.advanceTimersByTimeAsync(59_900)
    expect(first.settled).toBe(false)
    expect(asked).toEqual([`user-A/${MILO_PHOTO}`])

    await vi.advanceTimersByTimeAsync(100)
    expect(first.settled).toBe(true)
    expect(second.settled).toBe(true)
    expect(asked).toEqual([`user-A/${MILO_PHOTO}`, `user-B/${MILO_PHOTO}`])
    expect(stored.get(MILO_PHOTO)).toEqual(JPEG)
  })
})
