import type { SupabaseClient } from '@supabase/supabase-js'

const PHOTOS = 'animal-photos'

export type DisposableAccounts = {
  created(userId: string): string
  removeAll(admin: SupabaseClient): Promise<void>
}

/** Comptes d'un test local, retirés avec leurs photos : la suppression d'un compte n'emporte pas son dossier. */
export function disposableAccounts(url: string | undefined): DisposableAccounts {
  if (url !== undefined) assertLocalStack(url)
  const userIds = new Set<string>()
  return {
    created(userId) {
      userIds.add(userId)
      return userId
    },
    async removeAll(admin) {
      for (const userId of userIds) {
        const paths = await photoPaths(admin, userId)
        if (paths.length > 0) {
          const { error } = await admin.storage.from(PHOTOS).remove(paths)
          if (error) throw error
        }
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error && error.status !== 404) throw error
      }
      userIds.clear()
    },
  }
}

async function photoPaths(admin: SupabaseClient, folder: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(PHOTOS).list(folder)
  if (error) throw error
  const paths = await Promise.all(
    data.map(({ id, name }) =>
      id === null ? photoPaths(admin, `${folder}/${name}`) : [`${folder}/${name}`],
    ),
  )
  return paths.flat()
}

function assertLocalStack(url: string): void {
  const host = hostOf(url)
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Pile locale seulement, refusé : ${host ?? url}`)
  }
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}
