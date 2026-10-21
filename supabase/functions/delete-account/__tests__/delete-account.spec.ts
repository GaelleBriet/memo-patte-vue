// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_FOLDER_DEPTH, PHOTO_PAGE_SIZE } from '../account-erasure'
import { handleDeleteAccount } from '../delete-account'
import { fakeDeletionPorts, USER } from './fake-deletion-ports'

const NOW = Date.UTC(2026, 9, 21, 16, 5)
const NOW_SECONDS = NOW / 1000

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: USER, ...claims })}.signature`
}

function confirmedSecondsAgo(seconds: number): string {
  return jwt({ iat: NOW_SECONDS, amr: [{ method: 'password', timestamp: NOW_SECONDS - seconds }] })
}

const TOKEN = confirmedSecondsAgo(60)

function fakePorts(options: Parameters<typeof fakeDeletionPorts>[0] = {}) {
  return fakeDeletionPorts({ users: { [TOKEN]: USER }, ...options })
}

function request(init: { method?: string; token?: string | null } = {}): Request {
  const headers = new Headers()
  if (init.token !== null) headers.set('Authorization', `Bearer ${init.token ?? TOKEN}`)
  return new Request('http://localhost/functions/v1/delete-account', {
    method: init.method ?? 'POST',
    headers,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('handleDeleteAccount', () => {
  it('répond au contrôle CORS du WebView sans rien supprimer', async () => {
    const fake = fakePorts({ photos: ['milo.jpg'] })

    const response = await handleDeleteAccount(
      request({ method: 'OPTIONS', token: null }),
      fake.ports,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('authorization')
    expect(fake.calls).toEqual([])
  })

  it('refuse une autre méthode que POST', async () => {
    const fake = fakePorts()

    const response = await handleDeleteAccount(request({ method: 'GET' }), fake.ports)

    expect(response.status).toBe(405)
    expect(fake.deletedUser()).toBeNull()
  })

  it('refuse une demande sans jeton', async () => {
    const fake = fakePorts({ photos: ['milo.jpg'] })

    const response = await handleDeleteAccount(request({ token: null }), fake.ports)

    expect(response.status).toBe(401)
    expect(fake.calls).toEqual([])
  })

  it('refuse un jeton qui ne désigne aucun compte', async () => {
    const fake = fakePorts({ photos: ['milo.jpg'] })

    const response = await handleDeleteAccount(request({ token: 'jeton-inconnu' }), fake.ports)

    expect(response.status).toBe(401)
    expect(fake.calls).toEqual([])
  })

  it('refuse une identité confirmée il y a plus de 10 minutes, sans rien supprimer', async () => {
    const stale = confirmedSecondsAgo(10 * 60 + 1)
    const fake = fakePorts({ photos: ['milo.jpg'], users: { [stale]: USER } })

    const response = await handleDeleteAccount(request({ token: stale }), fake.ports)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'identity-expired' })
    expect(fake.calls).toEqual([])
  })

  it('accepte une identité confirmée il y a tout juste 10 minutes', async () => {
    const limit = confirmedSecondsAgo(10 * 60)
    const fake = fakePorts({ users: { [limit]: USER } })

    const response = await handleDeleteAccount(request({ token: limit }), fake.ports)

    expect(response.status).toBe(200)
    expect(fake.deletedUser()).toBe(USER)
  })

  it('ne prend pas un jeton rafraîchi pour une identité confirmée', async () => {
    const refreshed = jwt({
      iat: NOW_SECONDS,
      amr: [{ method: 'password', timestamp: NOW_SECONDS - 3600 }],
    })
    const fake = fakePorts({ users: { [refreshed]: USER } })

    const response = await handleDeleteAccount(request({ token: refreshed }), fake.ports)

    expect(response.status).toBe(401)
    expect(fake.deletedUser()).toBeNull()
  })

  it('retient la confirmation la plus récente du jeton', async () => {
    const token = jwt({
      amr: [
        { method: 'password', timestamp: NOW_SECONDS - 3600 },
        { method: 'oauth', timestamp: NOW_SECONDS - 30 },
      ],
    })
    const fake = fakePorts({ users: { [token]: USER } })

    const response = await handleDeleteAccount(request({ token }), fake.ports)

    expect(response.status).toBe(200)
  })

  it.each([
    ['sans heure de confirmation', jwt({ iat: NOW_SECONDS })],
    [
      'à l’heure de confirmation illisible',
      jwt({ amr: [{ method: 'password', timestamp: 'hier' }] }),
    ],
    ['illisible', 'pas-un-jeton'],
  ])('refuse un jeton %s', async (_, token) => {
    const fake = fakePorts({ users: { [token]: USER } })

    const response = await handleDeleteAccount(request({ token }), fake.ports)

    expect(response.status).toBe(401)
    expect(fake.calls).toEqual([])
  })

  it('ne supprime rien quand le compte du jeton ne peut pas être vérifié', async () => {
    const fake = fakePorts({ photos: ['milo.jpg'] })
    fake.ports.userIdFromToken = () => Promise.reject(new Error('auth injoignable'))

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(500)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(fake.calls).toEqual([])
  })

  it('efface les photos du dossier du compte, puis le compte', async () => {
    const fake = fakePorts({ photos: ['milo.jpg', 'luna.jpg'] })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await response.json()).toEqual({ status: 'deleted' })
    expect(fake.calls).toEqual([
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'remove', arg: [`${USER}/luna.jpg`, `${USER}/milo.jpg`] },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'deleteUser', arg: USER },
      { kind: 'record', arg: 'app' },
    ])
    expect(fake.photos).toEqual([])
  })

  it('efface page par page un dossier plus grand qu’une page', async () => {
    const names = Array.from({ length: PHOTO_PAGE_SIZE + 3 }, (_, index) => `photo-${index}.jpg`)
    const fake = fakePorts({ photos: names })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    const removed = fake.calls.filter((call) => call.kind === 'remove').map((call) => call.arg)
    expect(removed.map((paths) => (paths as string[]).length)).toEqual([PHOTO_PAGE_SIZE, 3])
    expect(fake.photos).toEqual([])
    expect(fake.deletedUser()).toBe(USER)
  })

  it('efface aussi les photos rangées dans des sous-dossiers', async () => {
    const fake = fakePorts({ photos: ['milo.jpg', 'vieux/rex.jpg', 'vieux/encore/kiki.jpg'] })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(fake.photos).toEqual([])
    expect(fake.deletedUser()).toBe(USER)
  })

  it('accepte des sous-dossiers jusqu’à la profondeur maximale', async () => {
    const nested = Array.from({ length: MAX_FOLDER_DEPTH }, (_, index) => `d${index}`)
    const fake = fakePorts({ photos: [[...nested, 'rex.jpg'].join('/')] })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(fake.photos).toEqual([])
  })

  it('garde le compte quand les sous-dossiers dépassent la profondeur maximale', async () => {
    const nested = Array.from({ length: MAX_FOLDER_DEPTH + 1 }, (_, index) => `d${index}`)
    const fake = fakePorts({ photos: [[...nested, 'rex.jpg'].join('/')] })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(500)
    expect(fake.deletedUser()).toBeNull()
  })

  it('supprime un compte sans photo', async () => {
    const fake = fakePorts()

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(fake.calls.map((call) => call.kind)).toEqual(['list', 'deleteUser', 'record'])
  })

  it('confirme la suppression même quand le journal ne répond pas', async () => {
    const fake = fakePorts({ failOn: 'record' })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'deleted' })
    expect(fake.deletedUser()).toBe(USER)
  })

  it.each(['list', 'remove'] as const)(
    'garde le compte quand le stockage échoue (%s)',
    async (failOn) => {
      const fake = fakePorts({ photos: ['milo.jpg'], failOn })

      const response = await handleDeleteAccount(request(), fake.ports)

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'deletion-failed' })
      expect(fake.deletedUser()).toBeNull()
    },
  )

  it('garde le compte quand des photos restent après leur effacement', async () => {
    const fake = fakePorts({ photos: ['milo.jpg'], removeKeepsPhotos: true })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(500)
    expect(fake.calls.filter((call) => call.kind === 'remove')).toHaveLength(1)
    expect(fake.deletedUser()).toBeNull()
  })

  it('signale l’échec de la suppression du compte', async () => {
    const fake = fakePorts({ failOn: 'deleteUser' })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'deletion-failed' })
    expect(fake.calls.map((call) => call.kind)).not.toContain('record')
  })

  it('ne touche qu’au dossier du compte du jeton', async () => {
    const fake = fakePorts({ photos: ['milo.jpg'] })

    await handleDeleteAccount(request(), fake.ports)

    const folders = fake.calls
      .filter((call) => call.kind === 'list')
      .map((call) => (call.arg as { folder: string }).folder)
    const paths = fake.calls
      .filter((call) => call.kind === 'remove')
      .flatMap((call) => call.arg as string[])
    expect(new Set(folders)).toEqual(new Set([USER]))
    expect(paths.every((path) => path.startsWith(`${USER}/`))).toBe(true)
  })
})
