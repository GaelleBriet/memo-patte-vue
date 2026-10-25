import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearAppStorage } from '@/shared/utils/app-storage'
import { restoreChoiceSnapshot } from '../service/restore-choice-snapshot'

describe('état du carnet gardé avec le choix « Remplacer »', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('survit à un redémarrage, puis s’oublie', () => {
    restoreChoiceSnapshot.save('animal:2:2026-10-25T08:00:00.000Z')

    expect(restoreChoiceSnapshot.read()).toBe('animal:2:2026-10-25T08:00:00.000Z')
    restoreChoiceSnapshot.clear()
    expect(restoreChoiceSnapshot.read()).toBeNull()
  })

  it('s’efface avec les autres réglages de l’app', () => {
    restoreChoiceSnapshot.save('animal:2:2026-10-25T08:00:00.000Z')

    clearAppStorage()

    expect(restoreChoiceSnapshot.read()).toBeNull()
  })

  it('stockage illisible : rien de gardé, sans lever', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('plein')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqué')
    })

    expect(() => restoreChoiceSnapshot.save('animal:2')).not.toThrow()
    expect(restoreChoiceSnapshot.read()).toBeNull()
  })
})
