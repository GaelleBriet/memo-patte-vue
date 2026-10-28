// @vitest-environment node
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleRevenuecatWebhook, type RevenuecatEvent } from '../webhook-request'
import { webhookSettingsFrom } from '../webhook-settings'

const AUTHORIZATION_32 = 'Bearer ' + 'a'.repeat(25)
const AUTHORIZATION_31 = 'Bearer ' + 'b'.repeat(24)
const SIGNING_SECRET = 'whsec_secret-de-signature'
const LEAKED_SECRET = 'whsec_' + 'c'.repeat(30)
const BOTH_NAMES = ['REVENUECAT_WEBHOOK_AUTHORIZATION', 'REVENUECAT_WEBHOOK_SIGNING_SECRET']

function settingsOf(env: Record<string, string>) {
  return webhookSettingsFrom((name) => env[name])
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('webhookSettingsFrom', () => {
  it('lit l’en-tête attendu et le secret de signature', () => {
    expect(
      settingsOf({
        REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION_32,
        REVENUECAT_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
      }),
    ).toEqual({ expectedAuthorization: AUTHORIZATION_32, signingSecret: SIGNING_SECRET })
  })

  it('retire les espaces autour des deux valeurs', () => {
    expect(
      settingsOf({
        REVENUECAT_WEBHOOK_AUTHORIZATION: ` ${AUTHORIZATION_32}\n`,
        REVENUECAT_WEBHOOK_SIGNING_SECRET: ` ${SIGNING_SECRET}\n`,
      }),
    ).toEqual({ expectedAuthorization: AUTHORIZATION_32, signingSecret: SIGNING_SECRET })
  })

  it('écarte un en-tête de moins de 32 caractères, et le dit sans le recopier', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const settings = settingsOf({
      REVENUECAT_WEBHOOK_AUTHORIZATION: `  ${AUTHORIZATION_31}  `,
      REVENUECAT_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
    })

    expect(settings.expectedAuthorization).toBeUndefined()
    expect(error).toHaveBeenCalledOnce()
    const written = JSON.stringify(error.mock.calls)
    expect(written).toContain('REVENUECAT_WEBHOOK_AUTHORIZATION')
    expect(written).toContain('32')
    expect(written).not.toContain(AUTHORIZATION_31)
  })

  it('rend les deux réglages absents quand rien n’est posé', () => {
    expect(settingsOf({})).toEqual({ expectedAuthorization: undefined, signingSecret: undefined })
    expect(
      settingsOf({
        REVENUECAT_WEBHOOK_AUTHORIZATION: '  ',
        REVENUECAT_WEBHOOK_SIGNING_SECRET: ' ',
      }),
    ).toEqual({ expectedAuthorization: undefined, signingSecret: undefined })
  })

  it.each([
    ['identique', LEAKED_SECRET],
    ['précédé de Bearer', `Bearer ${LEAKED_SECRET}`],
    ['en préfixe', `${LEAKED_SECRET}-fin`],
    ['au milieu', `début-${LEAKED_SECRET}-fin`],
  ])(
    'écarte le secret de signature contenu dans l’en-tête (%s), et nomme les deux sans leur valeur',
    (_, authorization) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})

      const settings = settingsOf({
        REVENUECAT_WEBHOOK_AUTHORIZATION: authorization,
        REVENUECAT_WEBHOOK_SIGNING_SECRET: LEAKED_SECRET,
      })

      expect(settings).toEqual({ expectedAuthorization: authorization, signingSecret: undefined })
      expect(error).toHaveBeenCalledOnce()
      const written = JSON.stringify(error.mock.calls)
      for (const name of BOTH_NAMES) expect(written).toContain(name)
      expect(written).toContain('ne doit pas contenir')
      expect(written).not.toContain(LEAKED_SECRET)
    },
  )

  it('cherche le secret dans l’en-tête après le retrait des espaces', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const settings = settingsOf({
      REVENUECAT_WEBHOOK_AUTHORIZATION: ` Bearer ${LEAKED_SECRET}\n`,
      REVENUECAT_WEBHOOK_SIGNING_SECRET: `\t${LEAKED_SECRET}  `,
    })

    expect(settings.signingSecret).toBeUndefined()
    expect(JSON.stringify(error.mock.calls)).toContain('ne doit pas contenir')
  })

  it('ne dit rien de plus quand les deux valeurs sont sans rapport ou que l’une manque', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      settingsOf({
        REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION_32,
        REVENUECAT_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
      }).signingSecret,
    ).toBe(SIGNING_SECRET)
    for (const signingSecret of [undefined, '', '   ']) {
      const env: Record<string, string> = { REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION_32 }
      if (signingSecret !== undefined) env.REVENUECAT_WEBHOOK_SIGNING_SECRET = signingSecret
      expect(settingsOf(env)).toEqual({
        expectedAuthorization: AUTHORIZATION_32,
        signingSecret: undefined,
      })
    }
    settingsOf({ REVENUECAT_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET })

    expect(error).not.toHaveBeenCalled()
  })

  it('garde le message de longueur quand l’en-tête trop court est recopié en secret', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const settings = settingsOf({
      REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION_31,
      REVENUECAT_WEBHOOK_SIGNING_SECRET: AUTHORIZATION_31,
    })

    expect(settings).toEqual({ expectedAuthorization: undefined, signingSecret: undefined })
    const written = JSON.stringify(error.mock.calls)
    expect(written).toContain('32')
    expect(written).not.toContain(AUTHORIZATION_31)
  })

  it('fait refuser en 503 un envoi signé avec le secret tiré de l’en-tête Bearer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const now = Date.UTC(2027, 2, 3, 10, 0, 0)
    const body = JSON.stringify({ event: { id: 'evt', type: 'RENEWAL', app_user_id: 'sophie' } })
    const at = now / 1000
    const v1 = createHmac('sha256', LEAKED_SECRET).update(`${at}.${body}`).digest('hex')
    const processEvent = vi.fn<(event: RevenuecatEvent) => Promise<void>>(async () => {})
    const settings = settingsOf({
      REVENUECAT_WEBHOOK_AUTHORIZATION: `Bearer ${LEAKED_SECRET}`,
      REVENUECAT_WEBHOOK_SIGNING_SECRET: LEAKED_SECRET,
    })

    const response = await handleRevenuecatWebhook(
      new Request('http://localhost/functions/v1/revenuecat-webhook', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LEAKED_SECRET}`,
          'X-RevenueCat-Webhook-Signature': `t=${at},v1=${v1}`,
        },
        body,
      }),
      { ...settings, now: () => now, processEvent },
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'webhook-not-configured' })
    expect(processEvent).not.toHaveBeenCalled()
  })
})

describe('index.ts de la fonction', () => {
  const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')

  it('lit ses réglages une fois, au démarrage, à travers webhookSettingsFrom', () => {
    expect(source).toContain('webhookSettingsFrom(env)')
    expect(source).not.toContain('REVENUECAT_WEBHOOK_AUTHORIZATION')
    expect(source).not.toContain('REVENUECAT_WEBHOOK_SIGNING_SECRET')
  })
})
