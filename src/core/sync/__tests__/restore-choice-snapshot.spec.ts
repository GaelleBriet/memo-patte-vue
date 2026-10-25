import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearAppStorage } from '@/shared/utils/app-storage'
import { restoreChoiceSnapshot } from '../service/restore-choice-snapshot'

describe('état du carnet gardé avec le choix « Remplacer »', () => {
  afterEach(() => {
    restoreChoiceSnapshot.clear()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('survit à un redémarrage, puis s’oublie', () => {
    restoreChoiceSnapshot.save('animal:2:2026-10-25T08:00:00.000Z')

    expect(restoreChoiceSnapshot.read()).toBe('animal:2:2026-10-25T08:00:00.000Z')
    restoreChoiceSnapshot.clear()
    expect(restoreChoiceSnapshot.read()).toBeNull()
  })

  it('s’efface avec les autres réglages de l’app', async () => {
    restoreChoiceSnapshot.save('animal:2:2026-10-25T08:00:00.000Z')

    clearAppStorage()
    vi.resetModules()
    const { restoreChoiceSnapshot: relaunched } = await import('../service/restore-choice-snapshot')

    expect(relaunched.read()).toBeNull()
  })

  it('stockage qui refuse d’écrire : gardé pour ce lancement, sans lever', () => {
    localStorage.setItem('memopatte.restore-choice-carnet', 'animal:1:ancien')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('plein')
    })

    expect(() => restoreChoiceSnapshot.save('animal:2')).not.toThrow()
    expect(restoreChoiceSnapshot.read()).toBe('animal:2')
  })

  it('stockage illisible : gardé pour ce lancement, rien sinon', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqué')
    })

    expect(restoreChoiceSnapshot.read()).toBeNull()
    restoreChoiceSnapshot.save('animal:2')
    expect(restoreChoiceSnapshot.read()).toBe('animal:2')
  })

  it('après un redémarrage, relu depuis le stockage', async () => {
    restoreChoiceSnapshot.save('animal:2')
    vi.resetModules()

    const { restoreChoiceSnapshot: relaunched } = await import('../service/restore-choice-snapshot')

    expect(relaunched.read()).toBe('animal:2')
  })
})
