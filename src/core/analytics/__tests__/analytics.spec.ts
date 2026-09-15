import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ANALYTICS_CONSENT_KEY,
  createAnalytics,
  POSTHOG_EU_HOST,
  type AnalyticsDependencies,
  type AnalyticsStorage,
  type PostHogClient,
} from '../analytics'

type TestEvents = {
  app_opened: null
  vaccination_added: { species: 'dog' | 'cat' }
}

function memoryStorage(): AnalyticsStorage & { keys(): string[] } {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
    keys: () => [...values.keys()],
  }
}

function fakePostHog() {
  return {
    init: vi.fn<PostHogClient['init']>(),
    capture: vi.fn<PostHogClient['capture']>(),
    opt_in_capturing: vi.fn<PostHogClient['opt_in_capturing']>(),
    opt_out_capturing: vi.fn<PostHogClient['opt_out_capturing']>(),
    reset: vi.fn<PostHogClient['reset']>(),
  }
}

let storage: ReturnType<typeof memoryStorage>
let posthog: ReturnType<typeof fakePostHog>
let loadPostHog: ReturnType<typeof vi.fn<() => Promise<PostHogClient>>>

function analytics(overrides: Partial<AnalyticsDependencies> = {}) {
  return createAnalytics<TestEvents>({
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
    const fail = () => {
      throw new Error('bloqué')
    }
    const broken: AnalyticsStorage = {
      getItem: fail,
      setItem: fail,
      removeItem: fail,
      key: fail,
      get length(): number {
        return fail()
      },
    }
    const module = analytics({ storage: broken })

    expect(module.consentStatus()).toBe('unanswered')
    await expect(module.optIn()).resolves.toBeUndefined()
    expect(module.hasConsent()).toBe(true)
    await expect(module.optOut()).resolves.toBeUndefined()
    expect(module.hasConsent()).toBe(false)
  })
})

describe('sans consentement', () => {
  it('ne charge jamais PostHog, même avec une clé', async () => {
    const module = analytics()

    await module.initAnalytics()
    module.track('app_opened')

    expect(loadPostHog).not.toHaveBeenCalled()
  })

  it('ne charge pas PostHog après un refus', async () => {
    const module = analytics()

    await module.optOut()
    await module.initAnalytics()
    module.track('app_opened')

    expect(loadPostHog).not.toHaveBeenCalled()
  })
})

describe('sans clé PostHog', () => {
  it('ne charge rien, même avec l’accord, et le choix est quand même retenu', async () => {
    const module = analytics({ apiKey: '' })

    await module.optIn()
    await module.initAnalytics()
    module.track('app_opened')
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
    module.track('app_opened')

    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('repart d’un identifiant neuf : réinitialise PostHog juste après le retrait', async () => {
    const module = analytics()
    await module.optIn()

    await module.optOut()
    await module.optIn()

    expect(posthog.reset).toHaveBeenCalledWith(true)
    const [optOutOrder] = posthog.opt_out_capturing.mock.invocationCallOrder
    const [resetOrder] = posthog.reset.mock.invocationCallOrder
    const [, secondOptInOrder] = posthog.opt_in_capturing.mock.invocationCallOrder
    expect(optOutOrder).toBeLessThan(resetOrder!)
    expect(resetOrder).toBeLessThan(secondOptInOrder!)
  })

  it('efface les traces PostHog laissées par une session précédente quand il n’est pas chargé', async () => {
    storage.setItem(ANALYTICS_CONSENT_KEY, 'granted')
    storage.setItem('ph_phc_test_posthog', '{"distinct_id":"ancien"}')
    storage.setItem('__ph_opt_in_out_phc_test', '1')
    storage.setItem('memopatte.notifications.primingAnswered', 'true')

    await analytics({ apiKey: '' }).optOut()

    expect(storage.keys().sort()).toEqual([
      ANALYTICS_CONSENT_KEY,
      'memopatte.notifications.primingAnswered',
    ])
    expect(storage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied')
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
    module.track('app_opened')

    expect(posthog.opt_in_capturing).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('reste silencieux quand PostHog ne se charge pas, et réessaie au prochain accord', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadPostHog.mockRejectedValueOnce(new Error('chunk absent'))
    const module = analytics()

    await expect(module.optIn()).resolves.toBeUndefined()
    module.track('app_opened')
    await module.initAnalytics()

    expect(loadPostHog).toHaveBeenCalledTimes(2)
    expect(posthog.init).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('catalogue d’événements', () => {
  it('refuse un événement hors catalogue et une propriété à valeur libre', () => {
    const module = analytics()

    // @ts-expect-error événement absent du catalogue
    module.track('animal_renamed')
    // @ts-expect-error valeur hors de l’union fermée
    module.track('vaccination_added', { species: 'Milo' })
    // @ts-expect-error propriété absente de l’événement
    module.track('vaccination_added', { species: 'dog', name: 'Milo' })

    const libre = createAnalytics<{ animal_added: { name: string } }>({
      apiKey: '',
      apiHost: undefined,
      storage,
      loadPostHog,
    })
    // @ts-expect-error une valeur `string` ouverte ne peut rien recevoir
    libre.track('animal_added', { name: 'Milo' })

    expect(posthog.capture).not.toHaveBeenCalled()
  })
})
