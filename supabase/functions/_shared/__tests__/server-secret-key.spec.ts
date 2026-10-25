// @vitest-environment node
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { serverSecretKeyFrom, withServerSecretKey } from '../server-secret-key'

type HandlerFor = (key: string) => (request: Request) => Promise<Response>

const SECRET_KEY = 'sb_secret_cle-de-test_0123'
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature-de-test'

function readingOf(env: Record<string, string>) {
  return serverSecretKeyFrom((name) => env[name])
}

function keysOf(keys: unknown) {
  return { SUPABASE_SECRET_KEYS: JSON.stringify(keys) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('serverSecretKeyFrom', () => {
  it('lit la clé secrète « default » de SUPABASE_SECRET_KEYS', () => {
    expect(readingOf(keysOf({ default: SECRET_KEY }))).toEqual({ key: SECRET_KEY })
  })

  it('ignore les autres clés secrètes du projet', () => {
    expect(readingOf(keysOf({ autre: 'sb_secret_autre', default: SECRET_KEY }))).toEqual({
      key: SECRET_KEY,
    })
  })

  it('ne retombe jamais sur l’ancienne clé service_role', () => {
    const reading = readingOf({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_KEY })

    expect(reading).toEqual({ problem: expect.stringContaining('SUPABASE_SECRET_KEYS') })
  })

  it.each([
    ['absente', {}],
    ['vide', { SUPABASE_SECRET_KEYS: '' }],
    ['illisible', { SUPABASE_SECRET_KEYS: '{default:' }],
    ['qui n’est pas un objet', { SUPABASE_SECRET_KEYS: JSON.stringify([SECRET_KEY]) }],
    ['réduite à une chaîne', { SUPABASE_SECRET_KEYS: JSON.stringify(SECRET_KEY) }],
    ['sans clé « default »', keysOf({ autre: SECRET_KEY })],
    ['dont « default » n’est pas un texte', keysOf({ default: 42 })],
  ])('refuse une variable %s', (_, env) => {
    expect(readingOf(env)).toEqual({ problem: expect.stringContaining('SUPABASE_SECRET_KEYS') })
  })

  it('refuse l’ancienne forme (JWT eyJ…) en le disant', () => {
    expect(readingOf(keysOf({ default: LEGACY_KEY }))).toEqual({
      problem: expect.stringContaining('ancienne forme'),
    })
  })

  it.each([
    ['une clé publique', 'sb_publishable_cle-de-test'],
    ['un préfixe seul', 'sb_secret_'],
    ['une espace', 'sb_secret_abc def'],
    ['un retour à la ligne', 'sb_secret_abc\ndef'],
  ])('refuse %s', (_, value) => {
    expect(readingOf(keysOf({ default: value }))).toEqual({
      problem: expect.stringContaining('sb_secret_'),
    })
  })

  it('ne cite jamais la valeur refusée', () => {
    for (const value of [LEGACY_KEY, 'sb_publishable_cle-de-test', 'sb_secret_abc def']) {
      const reading = readingOf(keysOf({ default: value }))

      expect(JSON.stringify(reading)).not.toContain(value)
    }
  })
})

describe('withServerSecretKey', () => {
  const request = () => new Request('http://localhost/functions/v1/test', { method: 'POST' })

  it('construit le traitement une seule fois, avec la clé lue', async () => {
    const handlerFor = vi.fn<HandlerFor>((key) => async () => new Response(key.length.toString()))
    const serve = withServerSecretKey('Essai', { key: SECRET_KEY }, handlerFor)

    await serve(request())
    const response = await serve(request())

    expect(handlerFor).toHaveBeenCalledOnce()
    expect(handlerFor).toHaveBeenCalledWith(SECRET_KEY)
    expect(await response.text()).toBe(String(SECRET_KEY.length))
  })

  it('refuse chaque demande en 503 et dit pourquoi, sans rien construire', async () => {
    const handlerFor = vi.fn<HandlerFor>()
    const reading = readingOf(keysOf({ default: LEGACY_KEY }))
    const serve = withServerSecretKey('Purge des comptes inactifs', reading, handlerFor)

    const response = await serve(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'server-key-not-configured' })
    expect(handlerFor).not.toHaveBeenCalled()
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain('Purge des comptes inactifs refusée')
    expect(logged).toContain('ancienne forme')
    expect(logged).not.toContain(LEGACY_KEY)
  })

  it('ajoute les en-têtes demandés au refus', async () => {
    const serve = withServerSecretKey('Essai', readingOf({}), vi.fn<HandlerFor>(), {
      'Access-Control-Allow-Origin': '*',
    })

    const response = await serve(request())

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })
})

describe.each(['delete-account', 'inactive-accounts', 'revenuecat-webhook'])(
  'index.ts de %s',
  (name) => {
    const source = readFileSync(new URL(`../../${name}/index.ts`, import.meta.url), 'utf8')

    it('lit la clé du serveur par serverSecretKeyFrom, derrière withServerSecretKey', () => {
      expect(source).toContain('serverSecretKeyFrom(')
      expect(source).toContain('withServerSecretKey(')
    })

    it('ne lit plus l’ancienne clé service_role', () => {
      expect(source).not.toContain('SERVICE_ROLE')
    })
  },
)
