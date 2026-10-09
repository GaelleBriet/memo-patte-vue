import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installCarnetSettingsReminders } from '../carnet-settings-reminders'
import type { CarnetSettings } from '@/features/settings/schema/carnet-settings.schema'
import {
  provideCarnetSettingsRepository,
  useCarnetSettingsStore,
} from '@/features/settings/store/carnet-settings.store'

vi.mock('@/features/treatments/service/reminders-sync.service', () => ({
  syncAllReminders: vi.fn<() => Promise<void>>(),
}))

const update = vi.fn<(changes: Partial<CarnetSettings>) => Promise<CarnetSettings>>()
const sync = vi.fn<() => Promise<void>>(async () => {})

beforeEach(() => {
  setActivePinia(createPinia())
  update.mockImplementation(async (changes) => ({
    vaccineReminderTime: '09:00',
    remindBeforeDue: true,
    ...changes,
  }))
  provideCarnetSettingsRepository(() => ({
    get: async () => ({ vaccineReminderTime: '09:00', remindBeforeDue: true }),
    update,
  }))
})

afterEach(() => {
  provideCarnetSettingsRepository(null)
  vi.clearAllMocks()
})

describe('installCarnetSettingsReminders', () => {
  it('reprogramme tous les rappels après un réglage enregistré', async () => {
    installCarnetSettingsReminders(sync)

    await useCarnetSettingsStore().update({ remindBeforeDue: false })
    await flushPromises()

    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('ne reprogramme rien quand le réglage n’a pas pu être enregistré', async () => {
    update.mockRejectedValueOnce(new Error('disque plein'))
    installCarnetSettingsReminders(sync)

    await expect(useCarnetSettingsStore().update({ vaccineReminderTime: '07:00' })).rejects.toThrow(
      'disque plein',
    )
    await flushPromises()

    expect(sync).not.toHaveBeenCalled()
  })

  it('ne reprogramme rien pour un simple chargement', async () => {
    installCarnetSettingsReminders(sync)

    await useCarnetSettingsStore().load()

    expect(sync).not.toHaveBeenCalled()
  })

  it('cesse d’écouter une fois désinstallé', async () => {
    const uninstall = installCarnetSettingsReminders(sync)
    uninstall()

    await useCarnetSettingsStore().update({ remindBeforeDue: false })
    await flushPromises()

    expect(sync).not.toHaveBeenCalled()
  })
})
