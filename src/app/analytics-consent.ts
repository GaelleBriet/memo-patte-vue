import { Capacitor } from '@capacitor/core'
import type { Router } from 'vue-router'

import { consentStatus, type ConsentStatus } from '@/core/analytics'

export const ANALYTICS_CONSENT_ROUTE = 'analytics-consent'

export function shouldAskConsent({ status, skip }: { status: ConsentStatus; skip: boolean }) {
  return status === 'unanswered' && !skip
}

// Aperçus navigateur de `pnpm dev` : les captures ne doivent pas tomber sur l'écran. Rien n'est enregistré.
const skipInBrowserPreview =
  import.meta.env.DEV &&
  !Capacitor.isNativePlatform() &&
  import.meta.env.VITE_ANALYTICS_CONSENT !== 'ask'

/**
 * Tant que la question des statistiques n'a pas eu de réponse, toute navigation mène à l'écran de
 * consentement ; une fois répondue, cet écran n'est plus accessible.
 */
export function installConsentGate(
  router: Router,
  needsConsent: () => boolean = () =>
    shouldAskConsent({ status: consentStatus(), skip: skipInBrowserPreview }),
): void {
  router.beforeEach((to) => {
    const asking = needsConsent()
    if (to.name === ANALYTICS_CONSENT_ROUTE) return asking || { name: 'home', replace: true }
    return asking ? { name: ANALYTICS_CONSENT_ROUTE, replace: true } : true
  })
}
