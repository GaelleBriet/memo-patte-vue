import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  homeRemindersService,
  type HomeReminderSource,
  type HomeRemindersService,
} from '../service/home-reminders.service'

export type HomeRemindersServiceProvider = () => HomeRemindersService

let provider: HomeRemindersServiceProvider = () => homeRemindersService

/** `null` rétablit le service réel, branché sur la base locale. */
export function provideHomeRemindersService(next: HomeRemindersServiceProvider | null): void {
  provider = next ?? (() => homeRemindersService)
}

export const useHomeStore = defineStore('home', () => {
  const sources = ref<HomeReminderSource[]>([])
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « aucun rappel ». */
  const hasLoaded = ref(false)
  const error = ref<Error | null>(null)
  let latestLoad = 0

  return {
    sources,
    isLoading,
    hasLoaded,
    error,

    /**
     * Ne lève pas : renvoie `false` et renseigne `error`. Seul le chargement lancé en dernier
     * s'affiche, pour qu'une lecture partie avant une écriture ne la masque pas.
     */
    async load(): Promise<boolean> {
      const call = ++latestLoad
      isLoading.value = true
      try {
        const loaded = await provider().listSources()
        if (call === latestLoad) {
          sources.value = loaded
          hasLoaded.value = true
          error.value = null
        }
        return true
      } catch (cause) {
        if (call === latestLoad) {
          error.value = cause instanceof Error ? cause : new Error(String(cause))
        }
        return false
      } finally {
        if (call === latestLoad) isLoading.value = false
      }
    },
  }
})
