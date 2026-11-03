// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isMissingPhotoObject } from '../animal-photos-bucket'
import { isTransportFailure } from '../transport-failure'
import { accountServer, clientOver, NOW, PUBLISHABLE_KEY, USER_ID } from './account-server'

const AUTH_GIVES_UP_MS = 60_000

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
})

async function settled<T>(request: PromiseLike<T>): Promise<T> {
  const outcome = Promise.resolve(request)
  await vi.advanceTimersByTimeAsync(AUTH_GIVES_UP_MS)
  return outcome
}

describe.each(['muet', 'coupé', 'refusé'] as const)(
  'jeton périmé, Auth %s au rafraîchissement',
  (auth) => {
    it('une lecture de lignes échoue comme une coupure, sans partir en anonyme', async () => {
      const { serverFetch, dataRequests } = accountServer(auth)
      const supabase = clientOver(serverFetch, 'périmé')

      const { count, error } = await settled(
        supabase
          .from('animals')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', USER_ID)
          .is('deleted_at', null),
      )

      expect(count).toBeNull()
      expect(isTransportFailure(error)).toBe(true)
      expect(dataRequests).toEqual([])
    })

    it('une liste de photos échoue, sans partir en anonyme', async () => {
      const { serverFetch, dataRequests } = accountServer(auth)
      const supabase = clientOver(serverFetch, 'périmé')

      const { data, error } = await settled(supabase.storage.from('animal-photos').list(USER_ID))

      expect(data).toBeNull()
      expect(error).not.toBeNull()
      expect(dataRequests).toEqual([])
    })

    it('un téléchargement de photo échoue sans être pris pour une photo absente', async () => {
      const { serverFetch, dataRequests } = accountServer(auth)
      const supabase = clientOver(serverFetch, 'périmé')

      const { data, error } = await settled(
        supabase.storage.from('animal-photos').download(`${USER_ID}/milo.webp`),
      )

      expect(data).toBeNull()
      expect(error).not.toBeNull()
      expect(isMissingPhotoObject(error)).toBe(false)
      expect(dataRequests).toEqual([])
    })
  },
)

describe('jeton périmé, Auth renouvelle la session', () => {
  it('la lecture et la liste de photos partent avec le nouveau jeton', async () => {
    const { serverFetch, dataRequests } = accountServer('renouvelé')
    const supabase = clientOver(serverFetch, 'périmé')

    const { count, error } = await settled(
      supabase.from('animals').select('id', { count: 'exact', head: true }).eq('user_id', USER_ID),
    )
    const photos = await settled(supabase.storage.from('animal-photos').list(USER_ID))

    expect(error).toBeNull()
    expect(count).toBe(2)
    expect(photos.error).toBeNull()
    expect(dataRequests).toEqual([
      '/rest/v1/animals Bearer jeton-utilisateur',
      '/storage/v1/object/list/animal-photos Bearer jeton-utilisateur',
    ])
  })
})

describe('jeton valide', () => {
  it('la lecture part avec le jeton de l’utilisateur et voit sa sauvegarde', async () => {
    const { serverFetch, dataRequests } = accountServer('muet')
    const supabase = clientOver(serverFetch, 'valide')

    const { count, error } = await settled(
      supabase.from('animals').select('id', { count: 'exact', head: true }).eq('user_id', USER_ID),
    )

    expect(error).toBeNull()
    expect(count).toBe(2)
    expect(dataRequests).toEqual(['/rest/v1/animals Bearer jeton-utilisateur'])
  })

  it('la liste de photos part avec le jeton de l’utilisateur', async () => {
    const { serverFetch, dataRequests } = accountServer('muet')
    const supabase = clientOver(serverFetch, 'valide')

    const { data, error } = await settled(supabase.storage.from('animal-photos').list(USER_ID))

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(dataRequests).toEqual(['/storage/v1/object/list/animal-photos Bearer jeton-utilisateur'])
  })

  it('Auth reste joignable avec la clé publique, pour se connecter', async () => {
    const { serverFetch } = accountServer('refusé')
    const supabase = clientOver(serverFetch, 'valide')

    await settled(supabase.auth.signInWithPassword({ email: 'a@exemple.fr', password: 'secret' }))

    const signIn = serverFetch.mock.calls.find(([input]) => String(input).includes('/auth/v1/'))
    expect(new Headers(signIn![1]?.headers).get('Authorization')).toBe(`Bearer ${PUBLISHABLE_KEY}`)
  })
})
