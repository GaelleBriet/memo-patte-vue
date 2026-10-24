import type { AccountErasurePorts, DeletionOrigin, StorageEntry } from './account-erasure.ts'

type Outcome = { error: unknown }

/** Le sous-ensemble du client Supabase (`service_role`) dont l'effacement d'un compte a besoin. */
export type ErasureClient = {
  storage: {
    from(bucket: string): {
      list(
        path: string,
        options: { limit: number },
      ): PromiseLike<{ data: StorageEntry[] | null; error: unknown }>
      remove(paths: string[]): PromiseLike<Outcome>
    }
  }
  auth: { admin: { deleteUser(id: string, shouldSoftDelete?: boolean): PromiseLike<Outcome> } }
  from(table: 'account_deletion_log'): {
    insert(row: { origin: DeletionOrigin }): PromiseLike<Outcome>
  }
}

export const PHOTOS_BUCKET = 'animal-photos'

export type SupabaseErasurePorts = Pick<
  AccountErasurePorts,
  'listPhotos' | 'removePhotos' | 'deleteUser' | 'recordDeletion'
>

export function supabaseErasurePorts(client: ErasureClient): SupabaseErasurePorts {
  const photos = client.storage.from(PHOTOS_BUCKET)
  return {
    async listPhotos(folder, limit) {
      const { data, error } = await photos.list(folder, { limit })
      if (error || !data) throw error ?? new Error('Liste des photos illisible')
      return data.map(({ name, id }) => ({ name, id }))
    },
    async removePhotos(paths) {
      const { error } = await photos.remove(paths)
      if (error) throw error
    },
    async deleteUser(userId) {
      const { error } = await client.auth.admin.deleteUser(userId, false)
      if (error) throw error
    },
    async recordDeletion(origin) {
      const { error } = await client.from('account_deletion_log').insert({ origin })
      if (error) throw error
    },
  }
}
