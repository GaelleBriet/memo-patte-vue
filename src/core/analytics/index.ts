import { createAnalytics, type Analytics } from './analytics'

export type { AnalyticsProperties, ConsentStatus } from './analytics'

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  }
}

const analytics: Analytics = createAnalytics({
  apiKey: import.meta.env.VITE_POSTHOG_KEY,
  apiHost: import.meta.env.VITE_POSTHOG_HOST,
  storage: browserStorage(),
  loadPostHog: async () => (await import('posthog-js/no-external')).default,
})

export const { initAnalytics, track, optIn, optOut, hasConsent, consentStatus } = analytics
