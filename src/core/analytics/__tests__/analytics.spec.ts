import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ANALYTICS_CONSENT_KEY,
  createAnalytics,
  POSTHOG_EU_HOST,
  type AnalyticsDependencies,
  type PostHogClient,
} from '../analytics'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  }
}

function fakePostHog() {
  return {
    init: vi.fn<PostHogClient['init']>(),
    capture: vi.fn<PostHogClient['capture']>(),
    opt_in_capturing: vi.fn<PostHogClient['opt_in_capturing']>(),
    opt_out_capturing: vi.fn<PostHogClient['opt_out_capturing']>(),
  }
}

let storage: Pick<Storage, 'getItem' | 'setItem'>
let posthog: ReturnType<typeof fakePostHog>
let loadPostHog: ReturnType<typeof vi.fn<() => Promise<PostHogClient>>>

function analytics(overrides: Partial<AnalyticsDependencies> = {}) {
  return createAnalytics({
    apiKey: 'phc_test',
    apiHost: undefined,
    storage,
    loadPostHog,
    ...overrides,
  })
}

beforeEach(() => {
  storage = memoryStorage()
  posthog = fakePostHog()
  loadPostHog = vi.fn<() => Promise<PostHogClient>>(async () => posthog)
})

describe('consentement', () => {
  it('n’a pas de réponse au premier lancement', () => {
    const module = analytics()

    expect(module.consentStatus()).toBe('unanswered')
    expect(module.hasConsent()).toBe(false)
  })

  it('retient l’accord et le refus d’un lancement à l’autre', async () => {
    await analytics().optIn()
    expect(analytics().consentStatus()).toBe('granted')
    expect(analytics().hasConsent()).toBe(true)

    await analytics().optOut()
    expect(analytics().consentStatus()).toBe('denied')
    expect(analytics().hasConsent()).toBe(false)
  })

  it('ignore une valeur stockée inconnue', () => {
    storage.setItem(ANALYTICS_CONSENT_KEY, 'peut-être')

    expect(analytics().consentStatus()).toBe('unanswered')
  })

  it('reste utilisable quand le stockage lève', async () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué')
      },
      setItem: () => {
        throw new Error('bloqué')
      },
    }
    const module = analytics({ storage: broken })

    expect(module.consentStatus()).toBe('unanswered')
    await expect(module.optIn()).resolves.toBeUndefined()
    expect(module.hasConsent()).toBe(true)
  })
})

describe('sans consentement', () => {
  it('ne charge jamais PostHog, même avec une clé', async () => {
    const module = analytics()

    await module.initAnalytics()
    module.track('vaccination_added')

    expect(loadPostHog).not.toHaveBeenCalled()
  })

  it('ne charge pas PostHog après un refus', async () => {
    const module = analytics()

    await module.optOut()
    await module.initAnalytics()
    module.track('vaccination_added')

    expect(loadPostHog).not.toHaveBeenCalled()
  })
})

describe('sans clé PostHog', () => {
  it('ne charge rien, même avec l’accord, et le choix est quand même retenu', async () => {
    const module = analytics({ apiKey: '' })

    await module.optIn()
    await module.initAnalytics()
    module.track('vaccination_added')
    await module.optOut()

    expect(loadPostHog).not.toHaveBeenCalled()
    expect(module.consentStatus()).toBe('denied')
  })
})

describe('avec la clé et l’accord', () => {
  it('initialise PostHog sur l’hôte EU, sans capture automatique ni stockage avant l’accord', async () => {
    storage.setItem(ANALYTICS_CONSENT_KEY, 'granted')

    await analytics().initAnalytics()

    expect(posthog.init).toHaveBeenCalledTimes(1)
    const [key, config] = posthog.init.mock.calls[0]!
    expect(key).toBe('phc_test')
    expect(config).toMatchObject({
      api_host: POSTHOG_EU_HOST,
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      persistence: 'localStorage',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
    })
    expect(POSTHOG_EU_HOST).toBe('https://eu.i.posthog.com')
  })

  it('prend l’hôte de `VITE_POSTHOG_HOST` quand il est fourni', async () => {
    storage.setItem(ANALYTICS_CONSENT_KEY, 'granted')

    await analytics({ apiHost: 'https://eu.proxy.example' }).initAnalytics()

    expect(posthog.init.mock.calls[0]![1]).toMatchObject({ api_host: 'https://eu.proxy.example' })
  })

  it('active la capture sans envoyer d’événement d’accord', async () => {
    storage.setItem(ANALYTICS_CONSENT_KEY, 'granted')

    await analytics().initAnalytics()

    expect(posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false })
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('transmet un événement explicite', async () => {
    storage.setItem(ANALYTICS_CONSENT_KEY, 'granted')
    const module = analytics()
    await module.initAnalytics()

    module.track('vaccination_added', { species: 'dog' })

    expect(posthog.capture).toHaveBeenCalledWith('vaccination_added', { species: 'dog' })
  })

  it('ne charge PostHog qu’une fois', async () => {
    storage.setItem(ANALYTICS_CONSENT_KEY, 'granted')
    const module = analytics()

    await Promise.all([module.initAnalytics(), module.initAnalytics(), module.optIn()])

    expect(loadPostHog).toHaveBeenCalledTimes(1)
    expect(posthog.init).toHaveBeenCalledTimes(1)
  })
})

describe('changement d’avis', () => {
  it('charge et active PostHog dès l’accord', async () => {
    const module = analytics()

    await module.optIn()

    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false })
  })

  it('coupe la capture au retrait, et plus rien ne part ensuite', async () => {
    const module = analytics()
    await module.optIn()

    await module.optOut()
    module.track('vaccination_added')

    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('réactive la capture sans recharger PostHog', async () => {
    const module = analytics()
    await module.optIn()
    await module.optOut()

    await module.optIn()

    expect(loadPostHog).toHaveBeenCalledTimes(1)
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(2)
  })

  it('ne réactive pas la capture si le refus arrive pendant le chargement', async () => {
    let finishLoading: (client: PostHogClient) => void = () => {}
    loadPostHog = vi.fn<() => Promise<PostHogClient>>(
      () => new Promise<PostHogClient>((resolve) => (finishLoading = resolve)),
    )
    const module = analytics()

    const accepting = module.optIn()
    const refusing = module.optOut()
    finishLoading(posthog)
    await Promise.all([accepting, refusing])
    module.track('vaccination_added')

    expect(posthog.opt_in_capturing).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('reste silencieux quand PostHog ne se charge pas, et réessaie au prochain accord', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadPostHog.mockRejectedValueOnce(new Error('chunk absent'))
    const module = analytics()

    await expect(module.optIn()).resolves.toBeUndefined()
    module.track('vaccination_added')
    await module.initAnalytics()

    expect(loadPostHog).toHaveBeenCalledTimes(2)
    expect(posthog.init).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
