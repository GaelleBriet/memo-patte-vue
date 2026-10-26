// @vitest-environment node
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { webhookSettingsFrom } from '../webhook-settings'

const AUTHORIZATION_32 = 'Bearer ' + 'a'.repeat(25)
const AUTHORIZATION_31 = 'Bearer ' + 'b'.repeat(24)
const SIGNING_SECRET = 'whsec_secret-de-signature'

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
})

describe('index.ts de la fonction', () => {
  const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')

  it('lit ses réglages une fois, au démarrage, à travers webhookSettingsFrom', () => {
    expect(source).toContain('webhookSettingsFrom(env)')
    expect(source).not.toContain('REVENUECAT_WEBHOOK_AUTHORIZATION')
    expect(source).not.toContain('REVENUECAT_WEBHOOK_SIGNING_SECRET')
  })
})
