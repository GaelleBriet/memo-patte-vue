// @vitest-environment node
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CRON_SECRET_HEADER,
  handleInactiveAccounts,
  inactiveAccountsSettingsFrom,
} from '../inactive-accounts'
import { candidate, fakePurgePorts } from './fake-purge-ports'

const SECRET = 'c'.repeat(32)
const UNCONFIRMED = candidate('aaaaaaaa-0000-4000-8000-000000000003', {
  createdAt: '2027-11-10T10:00:00.000Z',
  emailConfirmed: false,
})
const WARNED = candidate('aaaaaaaa-0000-4000-8000-000000000002', {
  plus: { expiresAt: '2026-10-01T10:00:00.000Z' },
  notice: { purgeOn: '2027-11-19', warnedAt: '2027-09-02T03:00:00.000Z', revenuecatErasedAt: null },
})

function cronRequest(secret: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (secret !== null) headers.set(CRON_SECRET_HEADER, secret)
  return new Request('http://localhost/functions/v1/inactive-accounts', {
    method: 'POST',
    ...init,
    headers,
  })
}

function settingsOf(env: Record<string, string>) {
  return inactiveAccountsSettingsFrom((name) => env[name])
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-11-20T03:00:00.000Z') })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('inactiveAccountsSettingsFrom', () => {
  it('passe à blanc par défaut', () => {
    expect(settingsOf({ INACTIVE_ACCOUNTS_CRON_SECRET: SECRET })).toEqual({
      cronSecret: SECRET,
      mode: 'dry-run',
    })
  })

  it('n’applique qu’avec INACTIVE_ACCOUNTS_MODE=apply en toutes lettres', () => {
    expect(settingsOf({ INACTIVE_ACCOUNTS_MODE: 'apply' }).mode).toBe('apply')
    for (const value of ['Apply', 'true', '1', 'yes', '']) {
      expect(settingsOf({ INACTIVE_ACCOUNTS_MODE: value }).mode).toBe('dry-run')
    }
  })

  it('ignore un secret de moins de 32 caractères', () => {
    expect(settingsOf({ INACTIVE_ACCOUNTS_CRON_SECRET: 'c'.repeat(31) }).cronSecret).toBeUndefined()
    expect(console.error).toHaveBeenCalledOnce()
  })
})

describe('handleInactiveAccounts', () => {
  it('refuse tout sans secret réglé', async () => {
    const fake = fakePurgePorts({ candidates: [UNCONFIRMED] })

    const response = await handleInactiveAccounts(cronRequest(SECRET), settingsOf({}), fake.ports)

    expect(response.status).toBe(503)
    expect(fake.calls).toEqual([])
  })

  it.each([
    ['absent', null],
    ['faux', 'd'.repeat(32)],
  ])('refuse un secret %s', async (_, secret) => {
    const fake = fakePurgePorts({ candidates: [UNCONFIRMED] })
    const settings = settingsOf({ INACTIVE_ACCOUNTS_CRON_SECRET: SECRET })

    const response = await handleInactiveAccounts(cronRequest(secret), settings, fake.ports)

    expect(response.status).toBe(401)
    expect(fake.calls).toEqual([])
  })

  it('refuse une autre méthode que POST', async () => {
    const fake = fakePurgePorts()
    const settings = settingsOf({ INACTIVE_ACCOUNTS_CRON_SECRET: SECRET })

    const response = await handleInactiveAccounts(
      cronRequest(SECRET, { method: 'GET' }),
      settings,
      fake.ports,
    )

    expect(response.status).toBe(405)
  })

  it('rend et journalise les comptes par étape, sans identifiant ni adresse', async () => {
    const fake = fakePurgePorts({ candidates: [UNCONFIRMED] })
    const settings = settingsOf({ INACTIVE_ACCOUNTS_CRON_SECRET: SECRET })

    const response = await handleInactiveAccounts(cronRequest(SECRET), settings, fake.ports)

    expect(response.status).toBe(200)
    const report = await response.json()
    expect(report).toMatchObject({ mode: 'dry-run', due: { unconfirmedDeletions: 1 } })
    const logged = vi.mocked(console.warn).mock.calls.flat().join(' ')
    expect(logged).toContain('"unconfirmedDeletions":1')
    expect(logged).not.toContain(UNCONFIRMED.userId)
    expect(logged).not.toContain('@')
  })

  it('le corps de la demande ne fait jamais passer en mode appliquer', async () => {
    const fake = fakePurgePorts({ candidates: [UNCONFIRMED] })
    const settings = settingsOf({ INACTIVE_ACCOUNTS_CRON_SECRET: SECRET })
    const body = JSON.stringify({ mode: 'apply', INACTIVE_ACCOUNTS_MODE: 'apply' })

    const response = await handleInactiveAccounts(
      cronRequest(SECRET, { body, headers: { 'Content-Type': 'application/json' } }),
      settings,
      fake.ports,
    )

    expect((await response.json()).mode).toBe('dry-run')
    expect(fake.calls.map((c) => c.kind)).toEqual(['list'])
  })

  it('applique seulement quand le réglage du serveur le dit', async () => {
    const fake = fakePurgePorts({ candidates: [WARNED] })
    const settings = settingsOf({
      INACTIVE_ACCOUNTS_CRON_SECRET: SECRET,
      INACTIVE_ACCOUNTS_MODE: 'apply',
    })

    const response = await handleInactiveAccounts(cronRequest(SECRET), settings, fake.ports)

    expect((await response.json()).done.deletions).toBe(1)
  })

  it('refuse d’appliquer quand un prestataire est mal réglé', async () => {
    const fake = fakePurgePorts({
      candidates: [UNCONFIRMED],
      invalidProviderSettings: ['POSTHOG_PERSONAL_API_KEY'],
    })
    const settings = settingsOf({
      INACTIVE_ACCOUNTS_CRON_SECRET: SECRET,
      INACTIVE_ACCOUNTS_MODE: 'apply',
    })

    const response = await handleInactiveAccounts(cronRequest(SECRET), settings, fake.ports)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'erasure-not-configured' })
  })

  it('répond 500 sans détail quand la liste des comptes est illisible', async () => {
    const fake = fakePurgePorts({ failOn: { kind: 'list' } })
    const settings = settingsOf({ INACTIVE_ACCOUNTS_CRON_SECRET: SECRET })

    const response = await handleInactiveAccounts(cronRequest(SECRET), settings, fake.ports)

    expect(response.status).toBe(500)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('@')
  })
})

describe('index.ts de la fonction', () => {
  const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')

  it('ne branche aucun canal d’e-mail réel', () => {
    expect(source).toContain('channel: NO_EMAIL_CHANNEL')
  })

  it('ne lit le mode et le secret qu’à travers inactiveAccountsSettingsFrom', () => {
    expect(source).not.toContain('INACTIVE_ACCOUNTS_MODE')
    expect(source).not.toContain('INACTIVE_ACCOUNTS_CRON_SECRET')
    expect(source).toContain('inactiveAccountsSettingsFrom(')
  })
})

describe('config.toml', () => {
  it('laisse la fonction vérifier elle-même le secret du cron', () => {
    const config = readFileSync(new URL('../../../config.toml', import.meta.url), 'utf8')

    expect(config).toMatch(/\[functions\.inactive-accounts\]\nverify_jwt = false\n/)
  })
})
