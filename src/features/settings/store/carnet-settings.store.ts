import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { CarnetSettingsRepository as FullCarnetSettingsRepository } from '../repository/carnet-settings.repository'
import { DEFAULT_CARNET_SETTINGS, type CarnetSettings } from '../schema/carnet-settings.schema'

type CarnetSettingsRepository = Pick<FullCarnetSettingsRepository, 'get' | 'update'>

export type CarnetSettingsRepositoryProvider = () =>
  CarnetSettingsRepository | Promise<CarnetSettingsRepository>

let provider: CarnetSettingsRepositoryProvider | null = null

export function provideCarnetSettingsRepository(
  next: CarnetSettingsRepositoryProvider | null,
): void {
  provider = next
}

export const useCarnetSettingsStore = defineStore('carnetSettings', () => {
  const settings = ref<CarnetSettings>({ ...DEFAULT_CARNET_SETTINGS })
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  function requireRepository(): Promise<CarnetSettingsRepository> {
    if (!provider) {
      throw new Error(
        'Repository des réglages du carnet absent : appelle provideCarnetSettingsRepository().',
      )
    }
    return Promise.resolve(provider())
  }

  /** Ne lève pas : renvoie `false` et renseigne `error`. */
  async function load(): Promise<boolean> {
    try {
      settings.value = await (await requireRepository()).get()
      hasLoaded.value = true
      error.value = null
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause))
      return false
    }
  }

  async function update(changes: Partial<CarnetSettings>): Promise<void> {
    settings.value = await (await requireRepository()).update(changes)
  }

  return { settings, hasLoaded, error, load, update }
})
