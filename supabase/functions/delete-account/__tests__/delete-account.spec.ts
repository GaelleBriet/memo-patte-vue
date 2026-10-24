// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_FOLDER_DEPTH, PHOTO_PAGE_SIZE } from '../../_shared/account-erasure'
import { adminSecretFrom } from '../admin-secret-setting'
import { handleDeleteAccount } from '../delete-account'
import { providerErasuresFrom } from '../../_shared/provider-settings'
import { fakeDeletionPorts, USER } from './fake-deletion-ports'
import { fakeFetch } from '../../_shared/__tests__/fake-fetch'

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
  vi.restoreAllMocks()
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

  it('supprime le compte depuis l’app quand le mode admin est désactivé par un secret trop court', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = fakePorts({ adminSecret: adminSecretFrom('trop-court') })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'deleted' })
    expect(fake.calls.at(-1)).toEqual({ kind: 'record', arg: 'app' })
  })

  it('ne journalise pas le refus d’un jeton depuis l’app', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = fakePorts()

    const response = await handleDeleteAccount(request({ token: 'jeton-inconnu' }), fake.ports)

    expect(response.status).toBe(401)
    expect(warn).not.toHaveBeenCalled()
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

  it('accepte une confirmation datée jusqu’à une minute dans le futur', async () => {
    const token = confirmedSecondsAgo(-60)
    const fake = fakePorts({ users: { [token]: USER } })

    const response = await handleDeleteAccount(request({ token }), fake.ports)

    expect(response.status).toBe(200)
  })

  it('refuse une confirmation datée de plus d’une minute dans le futur', async () => {
    const token = confirmedSecondsAgo(-61)
    const fake = fakePorts({ photos: ['milo.jpg'], users: { [token]: USER } })

    const response = await handleDeleteAccount(request({ token }), fake.ports)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'identity-expired' })
    expect(fake.calls).toEqual([])
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

  it('efface les prestataires, les photos juste avant le compte, puis repasse sur le dossier et chez RevenueCat', async () => {
    const fake = fakePorts({ photos: ['milo.jpg', 'luna.jpg'] })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await response.json()).toEqual({ status: 'deleted' })
    expect(fake.calls).toEqual([
      { kind: 'posthog', arg: USER },
      { kind: 'revenuecat', arg: USER },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'remove', arg: [`${USER}/luna.jpg`, `${USER}/milo.jpg`] },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'deleteUser', arg: USER },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'revenuecat', arg: USER },
      { kind: 'record', arg: 'app' },
    ])
    expect(fake.photos).toEqual([])
  })

  it('efface une photo envoyée par un autre téléphone pendant la suppression', async () => {
    const fake = fakePorts({ photos: ['milo.jpg'] })
    const deleteUser = fake.ports.deleteUser
    fake.ports.deleteUser = async (userId) => {
      fake.photos.push('luna.jpg')
      await deleteUser(userId)
    }

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(fake.photos).toEqual([])
    const afterDeletion = fake.calls.slice(fake.calls.findIndex((c) => c.kind === 'deleteUser'))
    expect(afterDeletion).toEqual([
      { kind: 'deleteUser', arg: USER },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'remove', arg: [`${USER}/luna.jpg`] },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'revenuecat', arg: USER },
      { kind: 'record', arg: 'app' },
    ])
  })

  it.each(['list', 'remove'] as const)(
    'confirme la suppression quand le second passage sur les photos échoue (%s), sans journaliser l’identifiant',
    async (failing) => {
      const fake = fakePorts({ photos: ['milo.jpg'] })
      const { deleteUser, listPhotos, removePhotos } = fake.ports
      fake.ports.deleteUser = async (userId) => {
        fake.photos.push('luna.jpg')
        await deleteUser(userId)
      }
      const refused = (folder: string) => new Error(`${folder} refusé`)
      fake.ports.listPhotos = async (folder, limit) => {
        if (failing === 'list' && fake.deletedUser()) throw refused(folder)
        return listPhotos(folder, limit)
      }
      fake.ports.removePhotos = async (paths) => {
        if (failing === 'remove' && fake.deletedUser()) throw refused(paths.join(','))
        return removePhotos(paths)
      }
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await handleDeleteAccount(request(), fake.ports)

      const written = JSON.stringify(logged.mock.calls)
      logged.mockRestore()
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'deleted' })
      expect(fake.calls.at(-1)).toEqual({ kind: 'record', arg: 'app' })
      expect(written).toContain('photos')
      expect(written).not.toContain(USER)
    },
  )

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
    expect(fake.calls.map((call) => call.kind)).toEqual([
      'posthog',
      'revenuecat',
      'list',
      'deleteUser',
      'list',
      'revenuecat',
      'record',
    ])
  })

  it('efface de nouveau chez RevenueCat le client recréé pendant la suppression', async () => {
    const fake = fakePorts()
    let customers = 1
    fake.ports.providerErasures = [async () => void (customers = 0)]
    const deleteUser = fake.ports.deleteUser
    fake.ports.deleteUser = async (userId) => {
      customers = 1
      await deleteUser(userId)
    }
    fake.ports.erasuresAfterDeletion = [async () => void (customers = 0)]

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(customers).toBe(0)
  })

  it('confirme la suppression quand le second effacement RevenueCat échoue, sans journaliser l’identifiant', async () => {
    const fake = fakePorts()
    fake.ports.erasuresAfterDeletion = [
      async (userId) => {
        throw new Error(`RevenueCat a refusé ${userId}`)
      },
    ]
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await handleDeleteAccount(request(), fake.ports)

    const written = JSON.stringify(logged.mock.calls)
    logged.mockRestore()
    expect(response.status).toBe(200)
    expect(fake.calls.at(-1)).toEqual({ kind: 'record', arg: 'app' })
    expect(written).toContain('prestataire')
    expect(written).not.toContain(USER)
  })

  it.each(['posthog', 'revenuecat'] as const)(
    'garde le compte quand l’effacement chez un prestataire échoue (%s)',
    async (failOn) => {
      const fake = fakePorts({ photos: ['milo.jpg'], failOn })

      const response = await handleDeleteAccount(request(), fake.ports)

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'deletion-failed' })
      expect(fake.deletedUser()).toBeNull()
      expect(fake.calls.map((call) => call.kind)).not.toContain('record')
    },
  )

  it('n’efface plus rien après l’échec de PostHog, photos comprises', async () => {
    const fake = fakePorts({ photos: ['milo.jpg'], failOn: 'posthog' })

    await handleDeleteAccount(request(), fake.ports)

    expect(fake.calls.map((call) => call.kind)).toEqual(['posthog'])
    expect(fake.photos).toEqual(['milo.jpg'])
  })

  it('refuse sans rien effacer quand un prestataire n’est pas configuré', async () => {
    const fake = fakePorts({
      photos: ['milo.jpg'],
      invalidProviderSettings: ['REVENUECAT_SECRET_KEY'],
    })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(503)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await response.json()).toEqual({ error: 'erasure-not-configured' })
    expect(fake.calls).toEqual([])
    expect(fake.photos).toEqual(['milo.jpg'])
  })

  it.each([
    ['PostHog', {}],
    ['RevenueCat', { POSTHOG_ERASURE: 'disabled' }],
  ])(
    'ne journalise ni la clé ni l’identifiant quand %s est injoignable',
    async (_, disabled: Record<string, string>) => {
      const env: Record<string, string> = {
        POSTHOG_PERSONAL_API_KEY: 'phx_clePersonnelleDeTest',
        POSTHOG_PROJECT_ID: '12345',
        POSTHOG_HOST: 'https://eu.posthog.com',
        REVENUECAT_SECRET_KEY: 'sk_cleSecreteDeTest',
        ...disabled,
      }
      const network = fakeFetch((request) => {
        throw new TypeError(
          `Invalid header value: "${request.headers.get('Authorization')}" ${request.url}`,
        )
      })
      const fake = fakePorts()
      Object.assign(
        fake.ports,
        providerErasuresFrom((name) => env[name], network.fetch),
      )
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await handleDeleteAccount(request(), fake.ports)

      expect(response.status).toBe(500)
      expect(network.requests).toHaveLength(1)
      const written = JSON.stringify(logged.mock.calls)
      logged.mockRestore()
      expect(written).not.toContain('phx_clePersonnelleDeTest')
      expect(written).not.toContain('sk_cleSecreteDeTest')
      expect(written).not.toContain(USER)
      expect(fake.deletedUser()).toBeNull()
    },
  )

  it('ne nomme pas le réglage manquant dans la réponse', async () => {
    const fake = fakePorts({ invalidProviderSettings: ['POSTHOG_PERSONAL_API_KEY'] })

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(await response.text()).not.toContain('POSTHOG')
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
