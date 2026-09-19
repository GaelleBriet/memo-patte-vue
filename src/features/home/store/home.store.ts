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

  return {
    sources,
    isLoading,
    hasLoaded,
    error,

    /** Ne lève pas : renvoie `false` et renseigne `error`. */
    async load(): Promise<boolean> {
      isLoading.value = true
      try {
        sources.value = await provider().listSources()
        hasLoaded.value = true
        error.value = null
        return true
      } catch (cause) {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
        return false
      } finally {
        isLoading.value = false
      }
    },
  }
})
