import { createAnalytics, type AnalyticsStorage } from './analytics'

export type { ConsentStatus } from './analytics'

/** Événements de l'app, noms et valeurs fermés ; le catalogue se remplit avec #68. */
export type AppAnalyticsEvents = Record<never, never>

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

export const { initAnalytics, track, optIn, optOut, hasConsent, consentStatus } = analytics
