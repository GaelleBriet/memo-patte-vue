import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CarnetSettings } from '../schema/carnet-settings.schema'
import {
  provideCarnetSettingsRepository,
  useCarnetSettingsStore,
} from '../store/carnet-settings.store'

let saved: CarnetSettings
const get = vi.fn<() => Promise<CarnetSettings>>()
const update = vi.fn<(changes: Partial<CarnetSettings>) => Promise<CarnetSettings>>()

beforeEach(() => {
  setActivePinia(createPinia())
  saved = { vaccineReminderTime: '09:00', remindBeforeDue: true }
  get.mockImplementation(async () => ({ ...saved }))
  update.mockImplementation(async (changes) => {
    saved = { ...saved, ...changes }
    return { ...saved }
  })
  provideCarnetSettingsRepository(() => ({ get, update }))
})

afterEach(() => {
  provideCarnetSettingsRepository(null)
  vi.clearAllMocks()
})

describe('useCarnetSettingsStore', () => {
  it('donne les réglages par défaut avant tout chargement', () => {
    const store = useCarnetSettingsStore()

    expect(store.settings).toEqual({ vaccineReminderTime: '09:00', remindBeforeDue: true })
    expect(store.hasLoaded).toBe(false)
  })

  it('charge les réglages enregistrés', async () => {
    saved = { vaccineReminderTime: '18:30', remindBeforeDue: false }
    const store = useCarnetSettingsStore()

    await expect(store.load()).resolves.toBe(true)

    expect(store.settings).toEqual({ vaccineReminderTime: '18:30', remindBeforeDue: false })
    expect(store.hasLoaded).toBe(true)
    expect(store.error).toBeNull()
  })

  it('ne lève pas quand le chargement échoue', async () => {
    get.mockRejectedValueOnce(new Error('base fermée'))
    const store = useCarnetSettingsStore()

    await expect(store.load()).resolves.toBe(false)

    expect(store.error?.message).toBe('base fermée')
    expect(store.hasLoaded).toBe(false)
  })

  it('écrit un changement dans carnet_settings et garde ce que la base a retenu', async () => {
    const store = useCarnetSettingsStore()

    await store.update({ remindBeforeDue: false })

    expect(update).toHaveBeenCalledWith({ remindBeforeDue: false })
    expect(store.settings).toEqual({ vaccineReminderTime: '09:00', remindBeforeDue: false })
  })

  it('lève quand l’écriture échoue, sans rien changer à l’écran', async () => {
    update.mockRejectedValueOnce(new Error('disque plein'))
    const store = useCarnetSettingsStore()

    await expect(store.update({ vaccineReminderTime: '07:00' })).rejects.toThrow('disque plein')

    expect(store.settings.vaccineReminderTime).toBe('09:00')
  })
})
