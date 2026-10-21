// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { handleDeleteAccount, PHOTO_PAGE_SIZE, type AccountDeletionPorts } from '../delete-account'

const USER = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'jeton-de-sophie'

type Call = { kind: 'list' | 'remove' | 'deleteUser'; arg: unknown }

function fakePorts(
  options: {
    photos?: string[]
    users?: Record<string, string>
    failOn?: Call['kind']
    removeKeepsPhotos?: boolean
  } = {},
) {
  const photos = [...(options.photos ?? [])]
  const users = options.users ?? { [TOKEN]: USER }
  const calls: Call[] = []
  let deletedUser: string | null = null

  const ports: AccountDeletionPorts = {
    async userIdFromToken(token) {
      return users[token] ?? null
    },
    async listPhotos(folder, limit) {
      calls.push({ kind: 'list', arg: { folder, limit } })
      if (options.failOn === 'list') throw new Error('stockage injoignable')
      return folder === USER ? photos.slice(0, limit) : []
    },
    async removePhotos(paths) {
      calls.push({ kind: 'remove', arg: paths })
      if (options.failOn === 'remove') throw new Error('stockage injoignable')
      if (options.removeKeepsPhotos) return
      for (const path of paths) photos.splice(photos.indexOf(path.slice(USER.length + 1)), 1)
    },
    async deleteUser(userId) {
      calls.push({ kind: 'deleteUser', arg: userId })
      if (options.failOn === 'deleteUser') throw new Error('auth injoignable')
      deletedUser = userId
    },
  }

  return { ports, calls, photos, deletedUser: () => deletedUser }
}

function request(init: { method?: string; token?: string | null } = {}): Request {
  const headers = new Headers()
  if (init.token !== null) headers.set('Authorization', `Bearer ${init.token ?? TOKEN}`)
  return new Request('http://localhost/functions/v1/delete-account', {
    method: init.method ?? 'POST',
    headers,
  })
}

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
      { kind: 'remove', arg: [`${USER}/milo.jpg`, `${USER}/luna.jpg`] },
      { kind: 'list', arg: { folder: USER, limit: PHOTO_PAGE_SIZE } },
      { kind: 'deleteUser', arg: USER },
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

  it('supprime un compte sans photo', async () => {
    const fake = fakePorts()

    const response = await handleDeleteAccount(request(), fake.ports)

    expect(response.status).toBe(200)
    expect(fake.calls.map((call) => call.kind)).toEqual(['list', 'deleteUser'])
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
