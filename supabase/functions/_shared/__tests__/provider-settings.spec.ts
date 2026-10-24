// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { providerErasuresFrom, revenuecatKeyFrom } from '../provider-settings'
import { fakeFetch, jsonResponse } from './fake-fetch'
import { USER } from './test-account'

const CONFIGURED: Record<string, string> = {
  POSTHOG_PERSONAL_API_KEY: 'phx_cle-personnelle-de-test',
  POSTHOG_PROJECT_ID: '12345',
  POSTHOG_HOST: 'https://eu.posthog.com',
  REVENUECAT_SECRET_KEY: 'sk_cle-secrete-de-test',
}

function settingsOf(env: Record<string, string>) {
  const fake = fakeFetch((request) =>
    request.url.includes('posthog')
      ? jsonResponse(202, { persons_found: 1, deletion_errors: [] })
      : jsonResponse(200, { app_user_id: USER, deleted: true }),
  )
  return { ...providerErasuresFrom((name) => env[name], fake.fetch), requests: fake.requests }
}

async function eraseWith(env: Record<string, string>) {
  const settings = settingsOf(env)
  for (const erase of settings.providerErasures) await erase(USER)
  return settings
}

describe('providerErasuresFrom', () => {
  it('efface chez PostHog puis chez RevenueCat quand tout est configuré', async () => {
    const settings = await eraseWith(CONFIGURED)

    expect(settings.invalidProviderSettings).toEqual([])
    expect(settings.requests.map((request) => new URL(request.url).host)).toEqual([
      'eu.posthog.com',
      'api.revenuecat.com',
    ])
  })

  it('nomme chaque réglage absent, sans rien effacer', () => {
    const settings = settingsOf({})

    expect(settings.providerErasures).toEqual([])
    expect(settings.invalidProviderSettings).toEqual([
      'POSTHOG_PERSONAL_API_KEY',
      'POSTHOG_PROJECT_ID',
      'POSTHOG_HOST',
      'REVENUECAT_SECRET_KEY',
    ])
  })

  it('tient un réglage fait d’espaces pour absent', () => {
    const settings = settingsOf({ ...CONFIGURED, REVENUECAT_SECRET_KEY: '   ' })

    expect(settings.invalidProviderSettings).toEqual(['REVENUECAT_SECRET_KEY'])
  })

  it('ignore les espaces autour d’un réglage', async () => {
    const settings = await eraseWith({ ...CONFIGURED, POSTHOG_PROJECT_ID: ' 12345\n' })

    expect(settings.invalidProviderSettings).toEqual([])
    expect(settings.requests[0]?.url).toContain('/api/projects/12345/')
  })

  it.each([
    ['une clé de projet PostHog, publique', 'POSTHOG_PERSONAL_API_KEY', 'phc_cle-publique'],
    ['un identifiant de projet qui n’est pas un nombre', 'POSTHOG_PROJECT_ID', 'mon-projet'],
    ['un hôte sans https', 'POSTHOG_HOST', 'http://eu.posthog.com'],
    ['un hôte illisible', 'POSTHOG_HOST', 'eu.posthog.com'],
    ['une clé publique RevenueCat', 'REVENUECAT_SECRET_KEY', 'goog_cle-publique'],
    ['une clé PostHog coupée par un retour à la ligne', 'POSTHOG_PERSONAL_API_KEY', 'phx_abc\ndef'],
    ['une clé PostHog réduite à son préfixe', 'POSTHOG_PERSONAL_API_KEY', 'phx_'],
    ['une clé RevenueCat coupée par un retour à la ligne', 'REVENUECAT_SECRET_KEY', 'sk_abc\ndef'],
    ['une clé RevenueCat avec une espace', 'REVENUECAT_SECRET_KEY', 'sk_abc def'],
    ['une clé RevenueCat réduite à son préfixe', 'REVENUECAT_SECRET_KEY', 'sk_'],
  ])('refuse %s', (_, name, value) => {
    const settings = settingsOf({ ...CONFIGURED, [name]: value })

    expect(settings.invalidProviderSettings).toEqual([name])
  })

  it('n’efface plus chez PostHog quand PostHog est désactivé', async () => {
    const settings = await eraseWith({
      REVENUECAT_SECRET_KEY: CONFIGURED.REVENUECAT_SECRET_KEY ?? '',
      POSTHOG_ERASURE: 'disabled',
    })

    expect(settings.invalidProviderSettings).toEqual([])
    expect(settings.requests.map((request) => new URL(request.url).host)).toEqual([
      'api.revenuecat.com',
    ])
  })

  it('n’efface plus chez RevenueCat quand RevenueCat est désactivé', async () => {
    const { REVENUECAT_SECRET_KEY: _, ...posthogOnly } = CONFIGURED
    const settings = await eraseWith({ ...posthogOnly, REVENUECAT_ERASURE: 'disabled' })

    expect(settings.invalidProviderSettings).toEqual([])
    expect(settings.requests.map((request) => new URL(request.url).host)).toEqual([
      'eu.posthog.com',
    ])
  })

  it('n’efface chez personne quand les deux sont désactivés', () => {
    const settings = settingsOf({ POSTHOG_ERASURE: 'disabled', REVENUECAT_ERASURE: 'disabled' })

    expect(settings.providerErasures).toEqual([])
    expect(settings.invalidProviderSettings).toEqual([])
  })

  it.each(['off', 'false', 'Disabled', ''])(
    'ne tient pas « %s » pour une désactivation',
    (value) => {
      const settings = settingsOf({ POSTHOG_ERASURE: value, REVENUECAT_ERASURE: value })

      expect(settings.invalidProviderSettings).toHaveLength(4)
    },
  )
})

describe('revenuecatKeyFrom', () => {
  const env = (values: Record<string, string>) => (name: string) => values[name]

  it('rend la clé secrète RevenueCat, sans espaces autour', () => {
    expect(revenuecatKeyFrom(env({ REVENUECAT_SECRET_KEY: ' sk_cle-secrete-de-test ' }))).toBe(
      'sk_cle-secrete-de-test',
    )
  })

  it.each([
    ['désactivé', { REVENUECAT_ERASURE: 'disabled', REVENUECAT_SECRET_KEY: 'sk_cle' }],
    ['absente', {}],
    ['invalide', { REVENUECAT_SECRET_KEY: 'pk_cle-publique' }],
  ])('ne rend rien quand RevenueCat est %s', (_, values: Record<string, string>) => {
    expect(revenuecatKeyFrom(env(values))).toBeNull()
  })
})
