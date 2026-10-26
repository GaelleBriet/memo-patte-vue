// @vitest-environment node
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleRevenuecatWebhook, type RevenuecatEvent } from '../webhook-request'
import { webhookSettingsFrom } from '../webhook-settings'

const AUTHORIZATION_32 = 'Bearer ' + 'a'.repeat(25)
const AUTHORIZATION_31 = 'Bearer ' + 'b'.repeat(24)
const SIGNING_SECRET = 'whsec_secret-de-signature'
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

  it('écarte le secret de signature quand il recopie l’en-tête, et nomme les deux sans leur valeur', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const settings = settingsOf({
      REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION_32,
      REVENUECAT_WEBHOOK_SIGNING_SECRET: AUTHORIZATION_32,
    })

    expect(settings).toEqual({ expectedAuthorization: AUTHORIZATION_32, signingSecret: undefined })
    expect(error).toHaveBeenCalledOnce()
    const written = JSON.stringify(error.mock.calls)
    for (const name of BOTH_NAMES) expect(written).toContain(name)
    expect(written).toContain('différents')
    expect(written).not.toContain(AUTHORIZATION_32)
  })

  it('compare les deux valeurs après le retrait des espaces', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const settings = settingsOf({
      REVENUECAT_WEBHOOK_AUTHORIZATION: ` ${AUTHORIZATION_32}\n`,
      REVENUECAT_WEBHOOK_SIGNING_SECRET: `\t${AUTHORIZATION_32}  `,
    })

    expect(settings.signingSecret).toBeUndefined()
    expect(JSON.stringify(error.mock.calls)).toContain('différents')
  })

  it('ne dit rien de plus quand les deux valeurs diffèrent ou que l’une manque', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    settingsOf({
      REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION_32,
      REVENUECAT_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
    })
    settingsOf({ REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION_32 })
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

  it('fait refuser en 503 un envoi signé avec la valeur de l’en-tête', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const now = Date.UTC(2027, 2, 3, 10, 0, 0)
    const body = JSON.stringify({ event: { id: 'evt', type: 'RENEWAL', app_user_id: 'sophie' } })
    const at = now / 1000
    const v1 = createHmac('sha256', AUTHORIZATION_32).update(`${at}.${body}`).digest('hex')
    const processEvent = vi.fn<(event: RevenuecatEvent) => Promise<void>>(async () => {})
    const settings = settingsOf({
      REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION_32,
      REVENUECAT_WEBHOOK_SIGNING_SECRET: AUTHORIZATION_32,
    })

    const response = await handleRevenuecatWebhook(
      new Request('http://localhost/functions/v1/revenuecat-webhook', {
        method: 'POST',
        headers: {
          Authorization: AUTHORIZATION_32,
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
