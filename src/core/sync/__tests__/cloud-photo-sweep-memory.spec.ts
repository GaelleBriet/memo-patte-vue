import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearAppStorage } from '@/shared/utils/app-storage'
import { cloudPhotoSweepMemory } from '../service/cloud-photo-sweep-memory'

const AT = '2026-10-28T10:00:00.000Z'

describe('cloudPhotoSweepMemory', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('rend l’heure du dernier passage retenue', () => {
    expect(cloudPhotoSweepMemory.read()).toBeNull()

    cloudPhotoSweepMemory.write(AT)

    expect(cloudPhotoSweepMemory.read()).toBe(AT)
  })

  it('s’oublie avec les autres réglages de l’app, à l’effacement des données', () => {
    cloudPhotoSweepMemory.write(AT)

    clearAppStorage()

    expect(cloudPhotoSweepMemory.read()).toBeNull()
  })

  it('ne lève pas quand le stockage refuse de lire ou d’écrire', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage plein')
    })

    expect(() => cloudPhotoSweepMemory.write(AT)).not.toThrow()
    expect(cloudPhotoSweepMemory.read()).toBeNull()
  })
})
