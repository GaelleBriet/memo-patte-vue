import { createAnalytics, type AnalyticsStorage } from './analytics'

export type { ConsentStatus } from './analytics'

/** Événements de l'app, noms et valeurs fermés. */
export type AppAnalyticsEvents = {
  $pageview: null
  animal_created: { species: 'dog' | 'cat' }
  vaccination_created: { species: 'dog' | 'cat' }
  treatment_created: { species: 'dog' | 'cat' }
  weight_added: { species: 'dog' | 'cat' }
  purchase_completed: { plan: 'monthly' | 'annual' | 'lifetime' }
}

function browserStorage(): AnalyticsStorage {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
    key: (index) => localStorage.key(index),
    get length() {
      return localStorage.length
    },
  }
}

const analytics = createAnalytics<AppAnalyticsEvents>({
  apiKey: import.meta.env.VITE_POSTHOG_KEY,
  apiHost: import.meta.env.VITE_POSTHOG_HOST,
  storage: browserStorage(),
  loadPostHog: async () => (await import('posthog-js/no-external')).default,
})

export const { initAnalytics, track, identify, reset, optIn, optOut, hasConsent, consentStatus } =
  analytics
