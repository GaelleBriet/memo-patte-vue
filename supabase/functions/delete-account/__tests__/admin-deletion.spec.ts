// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PHOTO_PAGE_SIZE } from '../account-erasure'
import { ADMIN_SECRET_HEADER } from '../admin-deletion'
import { handleDeleteAccount } from '../delete-account'
import { ADMIN_SECRET, fakeDeletionPorts, USER } from './fake-deletion-ports'

const SOPHIE = 'sophie@exemple.test'
const NOW = Date.UTC(2026, 9, 22, 21, 30)

function adminRequest(
  body: unknown,
  init: { secret?: string; authorization?: string; forwardedFor?: string } = {},
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.set(ADMIN_SECRET_HEADER, init.secret ?? ADMIN_SECRET)
  if (init.authorization) headers.set('Authorization', init.authorization)
  if (init.forwardedFor !== undefined) headers.set('x-forwarded-for', init.forwardedFor)
  return new Request('http://localhost/functions/v1/delete-account', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('handleDeleteAccount, demande reçue par e-mail', () => {
  it('supprime le compte de l’adresse reçue, puis note « email » au journal', async () => {
    const fake = fakeDeletionPorts({ photos: ['milo.jpg'] })

    const response = await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'account' }),
      fake.ports,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'deleted' })
    expect(fake.calls).toEqual([
      { kind: 'lookup', arg: SOPHIE },
      { kind: 'posthog', arg: USER },
      { kind: 'revenuecat', arg: USER },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'remove', arg: [`${USER}/milo.jpg`] },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'deleteUser', arg: USER },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'record', arg: 'email' },
    ])
  })

  it('refuse de supprimer le compte quand un prestataire n’est pas configuré', async () => {
    const fake = fakeDeletionPorts({
      photos: ['milo.jpg'],
      invalidProviderSettings: ['POSTHOG_PROJECT_ID'],
    })

    const response = await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'account' }),
      fake.ports,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'erasure-not-configured' })
    expect(fake.calls).toEqual([{ kind: 'lookup', arg: SOPHIE }])
  })

  it('efface seulement la sauvegarde cloud : photos puis carnet, le compte reste', async () => {
    const fake = fakeDeletionPorts({ photos: ['milo.jpg', 'vieux/luna.jpg'] })

    const response = await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'cloud-backup' }),
      fake.ports,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'backup-deleted' })
    expect(fake.photos).toEqual([])
    expect(fake.calls.at(-1)).toEqual({ kind: 'backup', arg: USER })
    expect(fake.calls.map((call) => call.kind)).not.toContain('deleteUser')
    expect(fake.calls.map((call) => call.kind)).not.toContain('record')
  })

  it('garde la personne PostHog et le client RevenueCat quand seule la sauvegarde part', async () => {
    const fake = fakeDeletionPorts({ photos: ['milo.jpg'] })

    await handleDeleteAccount(adminRequest({ email: SOPHIE, scope: 'cloud-backup' }), fake.ports)

    const kinds = fake.calls.map((call) => call.kind)
    expect(kinds).not.toContain('posthog')
    expect(kinds).not.toContain('revenuecat')
  })

  it('efface la sauvegarde seule même sans prestataire configuré', async () => {
    const fake = fakeDeletionPorts({ invalidProviderSettings: ['REVENUECAT_SECRET_KEY'] })

    const response = await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'cloud-backup' }),
      fake.ports,
    )

    expect(response.status).toBe(200)
    expect(fake.calls.at(-1)).toEqual({ kind: 'backup', arg: USER })
  })

  it('garde le carnet de la sauvegarde quand ses photos ne s’effacent pas', async () => {
    const fake = fakeDeletionPorts({ photos: ['milo.jpg'], failOn: 'remove' })

    const response = await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'cloud-backup' }),
      fake.ports,
    )

    expect(response.status).toBe(500)
    expect(fake.calls.map((call) => call.kind)).not.toContain('backup')
  })

  it.each([
    ['faux', { secret: 'pas-le-bon-secret' }, ADMIN_SECRET],
    ['vide', { secret: '' }, ADMIN_SECRET],
    ['absent de la fonction', {}, undefined],
    ['vide dans la fonction comme dans la demande', { secret: '' }, ''],
  ])('refuse un secret %s sans chercher le compte', async (_, init, configured) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = fakeDeletionPorts({ adminSecret: configured, photos: ['milo.jpg'] })

    const response = await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'account' }, init),
      fake.ports,
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
    expect(fake.calls).toEqual([])
  })

  it('journalise chaque refus avec l’adresse IP et l’heure, sans le secret ni le compte', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = fakeDeletionPorts()
    const tried = 'secret-essaye-par-un-inconnu-0123456789'

    const response = await handleDeleteAccount(
      adminRequest(
        { email: SOPHIE, scope: 'account' },
        { secret: tried, forwardedFor: '203.0.113.7, 10.0.0.1' },
      ),
      fake.ports,
    )

    expect(response.status).toBe(401)
    expect(warn).toHaveBeenCalledTimes(1)
    const written = JSON.stringify(warn.mock.calls)
    expect(written).toContain('203.0.113.7')
    expect(written).not.toContain('10.0.0.1')
    expect(written).toContain(new Date(NOW).toISOString())
    for (const secret of [tried, ADMIN_SECRET, SOPHIE, USER]) {
      expect(written).not.toContain(secret)
    }
  })

  it.each([
    ['absente', undefined, 'unknown'],
    ['vide', '', 'unknown'],
    ['en IPv6', '2001:db8::1', '2001:db8::1'],
    ['qui n’est pas une adresse', 'sophie@exemple.test', 'unknown'],
  ])('journalise une adresse IP %s', async (_, forwardedFor, logged) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'account' }, { secret: 'faux', forwardedFor }),
      fakeDeletionPorts().ports,
    )

    const written = JSON.stringify(warn.mock.calls)
    expect(written).toContain(logged)
    expect(written).not.toContain(SOPHIE)
  })

  it('journalise aussi le refus quand le mode admin est désactivé', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'account' }),
      fakeDeletionPorts({ adminSecret: undefined }).ports,
    )

    expect(response.status).toBe(401)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('ne journalise rien quand le secret est le bon', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await handleDeleteAccount(
      adminRequest({ email: SOPHIE, scope: 'account' }),
      fakeDeletionPorts().ports,
    )

    expect(warn).not.toHaveBeenCalled()
  })

  it('ne se rabat jamais sur la demande depuis l’app quand le secret est faux', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = fakeDeletionPorts({ users: { 'jeton-valide': USER } })

    const response = await handleDeleteAccount(
      adminRequest(
        { email: SOPHIE, scope: 'account' },
        { secret: 'pas-le-bon-secret', authorization: 'Bearer jeton-valide' },
      ),
      fake.ports,
    )

    expect(response.status).toBe(401)
    expect(fake.deletedUser()).toBeNull()
  })

  it.each([
    ['qui n’est pas du JSON', 'pas du json'],
    ['sans adresse', { scope: 'account' }],
    ['à l’adresse vide', { email: '  ', scope: 'account' }],
    ['sans ce qu’il faut supprimer', { email: SOPHIE }],
    ['qui demande autre chose', { email: SOPHIE, scope: 'photos' }],
    ['qui n’est pas un objet', ['account']],
  ])('refuse une demande %s', async (_, body) => {
    const fake = fakeDeletionPorts()

    const response = await handleDeleteAccount(adminRequest(body), fake.ports)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid-request' })
    expect(fake.calls).toEqual([])
  })

  it('dit qu’aucun compte n’a cette adresse, sans rien supprimer', async () => {
    const fake = fakeDeletionPorts()

    const response = await handleDeleteAccount(
      adminRequest({ email: 'inconnue@exemple.test', scope: 'account' }),
      fake.ports,
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'account-not-found' })
    expect(fake.calls).toEqual([{ kind: 'lookup', arg: 'inconnue@exemple.test' }])
  })

  it.each([
    ['la recherche du compte', 'lookup', 'account'],
    ['l’effacement du carnet', 'backup', 'cloud-backup'],
    ['l’effacement chez PostHog', 'posthog', 'account'],
    ['l’effacement chez RevenueCat', 'revenuecat', 'account'],
    ['la suppression du compte', 'deleteUser', 'account'],
  ] as const)('signale l’échec de %s', async (_, failOn, scope) => {
    const fake = fakeDeletionPorts({ failOn })

    const response = await handleDeleteAccount(adminRequest({ email: SOPHIE, scope }), fake.ports)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'deletion-failed' })
    expect(fake.calls.map((call) => call.kind)).not.toContain('record')
  })
})
