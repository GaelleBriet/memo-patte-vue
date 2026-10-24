// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  PHOTOS_BUCKET,
  supabaseErasurePorts,
  type ErasureClient,
} from '../supabase-account-erasure'
import { USER } from './test-account'

function fakeClient(error: unknown = null) {
  const calls: unknown[][] = []
  const client: ErasureClient = {
    storage: {
      from(bucket) {
        calls.push(['bucket', bucket])
        return {
          async list(path, options) {
            calls.push(['list', path, options])
            return error
              ? { data: null, error }
              : {
                  data: [
                    Object.assign({ name: 'chien', id: null }, { bucket_id: 'animal-photos' }),
                    { name: 'a.jpg', id: 'x' },
                  ],
                  error: null,
                }
          },
          async remove(paths) {
            calls.push(['remove', paths])
            return { error }
          },
        }
      },
    },
    auth: {
      admin: {
        async deleteUser(id, soft) {
          calls.push(['deleteUser', id, soft])
          return { error }
        },
      },
    },
    from(table) {
      return {
        async insert(row) {
          calls.push(['insert', table, row])
          return { error }
        },
      }
    },
  }
  return { client, calls }
}

describe('supabaseErasurePorts', () => {
  it('passe par le bucket des photos et garde le nom et l’identifiant de chaque entrée', async () => {
    const fake = fakeClient()
    const ports = supabaseErasurePorts(fake.client)

    expect(await ports.listPhotos(USER, 100)).toEqual([
      { name: 'chien', id: null },
      { name: 'a.jpg', id: 'x' },
    ])
    await ports.removePhotos([`${USER}/a.jpg`])
    await ports.deleteUser(USER)
    await ports.recordDeletion('inactivity')

    expect(fake.calls).toEqual([
      ['bucket', PHOTOS_BUCKET],
      ['list', USER, { limit: 100 }],
      ['remove', [`${USER}/a.jpg`]],
      ['deleteUser', USER, false],
      ['insert', 'account_deletion_log', { origin: 'inactivity' }],
    ])
    expect(PHOTOS_BUCKET).toBe('animal-photos')
  })

  it('lève l’erreur rendue par Supabase', async () => {
    const failure = new Error('refusé')
    const ports = supabaseErasurePorts(fakeClient(failure).client)

    await expect(ports.listPhotos(USER, 100)).rejects.toBe(failure)
    await expect(ports.removePhotos(['x'])).rejects.toBe(failure)
    await expect(ports.deleteUser(USER)).rejects.toBe(failure)
    await expect(ports.recordDeletion('app')).rejects.toBe(failure)
  })
})
