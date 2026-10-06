import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCareSignalBackfill } from '../care-signal-backfill'
import { isCareBackfillDone, readUsageSignals } from '@/shared/utils/usage-signals'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

const vaccinations = vi.fn<() => Promise<{ createdAt: string }[]>>()
const treatments = vi.fn<() => Promise<{ createdAt: string }[]>>()

const backfill = createCareSignalBackfill({
  vaccinations: () => ({ listAll: vaccinations }),
  treatments: () => ({ listAll: treatments }),
})

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vaccinations.mockReset().mockResolvedValue([])
  treatments.mockReset().mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('rattrapage du premier soin au démarrage', () => {
  it('prend le plus ancien vaccin ou traitement d’un carnet déjà rempli', async () => {
    vaccinations.mockResolvedValue([{ createdAt: '2026-05-02T08:00:00.000Z' }])
    treatments.mockResolvedValue([
      { createdAt: '2026-06-01T08:00:00.000Z' },
      { createdAt: '2026-04-20T08:00:00.000Z' },
    ])

    await backfill()

    expect(readUsageSignals().care.firstAt).toBe('2026-04-20T08:00:00.000Z')
  })

  it('ne relit plus le carnet une fois fait', async () => {
    await backfill()
    await backfill()

    expect(vaccinations).toHaveBeenCalledOnce()
  })

  it('réessaie au prochain démarrage quand la base ne répond pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vaccinations.mockRejectedValue(new Error('base indisponible'))

    await expect(backfill()).resolves.toBeUndefined()

    expect(isCareBackfillDone()).toBe(false)
  })
})
