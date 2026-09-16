import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ANALYTICS_CONSENT_ROUTE, installConsentGate, shouldAskConsent } from '../analytics-consent'
import { createRemindersPriming } from '../reminders-priming'
import type { ConsentStatus } from '@/core/analytics'

const Vide = { render: () => null }

function routeur(status: () => ConsentStatus, skip = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Vide },
      { path: '/settings', name: 'settings', component: Vide },
      { path: '/analytics/consent', name: ANALYTICS_CONSENT_ROUTE, component: Vide },
      { path: '/notifications/priming', name: 'notifications-priming', component: Vide },
    ],
  })
  installConsentGate(router, () => shouldAskConsent({ status: status(), skip }))
  return router
}

describe('shouldAskConsent', () => {
  it('ne demande qu’une fois, tant que la question n’a pas eu de réponse', () => {
    expect(shouldAskConsent({ status: 'unanswered', skip: false })).toBe(true)
    expect(shouldAskConsent({ status: 'granted', skip: false })).toBe(false)
    expect(shouldAskConsent({ status: 'denied', skip: false })).toBe(false)
  })

  it('ne demande rien quand l’aperçu de développement l’écarte', () => {
    expect(shouldAskConsent({ status: 'unanswered', skip: true })).toBe(false)
  })
})

describe('installConsentGate', () => {
  it('ouvre l’écran de consentement avant l’accueil au premier lancement', async () => {
    const router = routeur(() => 'unanswered')

    await router.push('/')

    expect(router.currentRoute.value.name).toBe(ANALYTICS_CONSENT_ROUTE)
  })

  it('ramène à l’écran de consentement tant qu’il n’a pas de réponse', async () => {
    const router = routeur(() => 'unanswered')
    await router.push('/')

    await router.push('/settings')

    expect(router.currentRoute.value.name).toBe(ANALYTICS_CONSENT_ROUTE)
  })

  it('laisse passer une fois la réponse donnée, et ne rouvre plus l’écran', async () => {
    let status: ConsentStatus = 'unanswered'
    const router = routeur(() => status)
    await router.push('/')

    status = 'denied'
    await router.replace({ name: 'home' })
    expect(router.currentRoute.value.name).toBe('home')

    await router.push({ name: ANALYTICS_CONSENT_ROUTE })
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('n’affiche jamais l’écran d’explication des rappels par-dessus le consentement', async () => {
    const router = routeur(() => 'unanswered')
    await router.push('/')
    const prompt = createRemindersPriming({
      isNativePlatform: () => true,
      shouldShowPriming: async () => true,
      animals: () => ({
        list: async () => [
          { id: '11111111-1111-4111-8111-111111111111', deletedAt: null } as never,
        ],
      }),
      vaccinations: () => ({ listAll: async () => [] }),
      treatments: () => ({
        listAll: async () => [
          {
            id: '44444444-4444-4444-8444-444444444444',
            animalId: '11111111-1111-4111-8111-111111111111',
            deletedAt: null,
          } as never,
        ],
      }),
      today: () => '2026-09-15',
    })
    const replace = vi.spyOn(router, 'replace')

    await expect(prompt(router, 'home')).resolves.toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
})
