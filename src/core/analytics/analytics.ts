import type { PostHog, PostHogConfig } from 'posthog-js'

export type ConsentStatus = 'granted' | 'denied' | 'unanswered'

export type AnalyticsProperties = Record<string, string | number | boolean | null>

export type PostHogClient = Pick<
  PostHog,
  'init' | 'capture' | 'opt_in_capturing' | 'opt_out_capturing'
>

export interface AnalyticsDependencies {
  apiKey: string | undefined
  apiHost: string | undefined
  storage: Pick<Storage, 'getItem' | 'setItem'>
  loadPostHog: () => Promise<PostHogClient>
}

export interface Analytics {
  /** Charge PostHog seulement si une clé est configurée et que l'utilisateur a accepté. */
  initAnalytics(): Promise<void>
  /** Sans effet sans clé ou sans accord. Aucune donnée du carnet dans `properties`. */
  track(event: string, properties?: AnalyticsProperties): void
  optIn(): Promise<void>
  optOut(): Promise<void>
  hasConsent(): boolean
  consentStatus(): ConsentStatus
}

export const ANALYTICS_CONSENT_KEY = 'memopatte.analytics.consent'
export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com'

function postHogConfig(apiHost: string): Partial<PostHogConfig> {
  return {
    api_host: apiHost,
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    persistence: 'localStorage',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_performance: false,
    rageclick: false,
    save_referrer: false,
    save_campaign_params: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
  }
}

export function createAnalytics({
  apiKey,
  apiHost,
  storage,
  loadPostHog,
}: AnalyticsDependencies): Analytics {
  let status: ConsentStatus = readStatus()
  let client: PostHogClient | null = null
  let loading: Promise<PostHogClient | null> | null = null

  function readStatus(): ConsentStatus {
    try {
      const stored = storage.getItem(ANALYTICS_CONSENT_KEY)
      return stored === 'granted' || stored === 'denied' ? stored : 'unanswered'
    } catch {
      return 'unanswered'
    }
  }

  function writeStatus(next: 'granted' | 'denied'): void {
    status = next
    try {
      storage.setItem(ANALYTICS_CONSENT_KEY, next)
    } catch {
      // Sans stockage, la question reviendra au prochain lancement : rien ne part d'ici là.
    }
  }

  function load(): Promise<PostHogClient | null> {
    loading ??= loadPostHog()
      .then((posthog) => {
        posthog.init(apiKey!, postHogConfig(apiHost || POSTHOG_EU_HOST))
        client = posthog
        return posthog
      })
      .catch((cause: unknown) => {
        console.warn('Statistiques d’usage indisponibles :', cause)
        loading = null
        return null
      })
    return loading
  }

  async function startCapturing(): Promise<void> {
    if (!apiKey || status !== 'granted') return
    const posthog = await load()
    if (posthog && status === 'granted') posthog.opt_in_capturing({ captureEventName: false })
  }

  return {
    initAnalytics: startCapturing,

    track(event, properties) {
      if (status === 'granted') client?.capture(event, properties)
    },

    async optIn() {
      writeStatus('granted')
      await startCapturing()
    },

    async optOut() {
      writeStatus('denied')
      const posthog = client ?? (loading ? await loading : null)
      posthog?.opt_out_capturing()
    },

    hasConsent: () => status === 'granted',
    consentStatus: () => status,
  }
}
