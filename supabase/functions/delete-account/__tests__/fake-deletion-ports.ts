import type { StorageEntry } from '../account-erasure'
import type { AccountDeletionPorts } from '../delete-account'

export const USER = '11111111-1111-4111-8111-111111111111'
export const ADMIN_SECRET = 'secret-admin-de-test-assez-long-pour-etre-realiste'

export type Call = {
  kind: 'list' | 'remove' | 'deleteUser' | 'record' | 'lookup' | 'backup'
  arg: unknown
}

/** Comme `storage.list()` : les sous-dossiers reviennent comme une entrée sans `id`. */
function childrenOf(photos: string[], folder: string, limit: number): StorageEntry[] {
  if (folder !== USER && !folder.startsWith(`${USER}/`)) return []
  const prefix = folder === USER ? '' : `${folder.slice(USER.length + 1)}/`
  const entries = new Map<string, StorageEntry>()
  for (const photo of photos.filter((path) => path.startsWith(prefix))) {
    const [name = '', ...rest] = photo.slice(prefix.length).split('/')
    entries.set(name, { name, id: rest.length > 0 ? null : `id-${photo}` })
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit)
}

export function fakeDeletionPorts(
  options: {
    photos?: string[]
    users?: Record<string, string>
    accounts?: Record<string, string>
    adminSecret?: string | undefined
    failOn?: Call['kind']
    removeKeepsPhotos?: boolean
  } = {},
) {
  const photos = [...(options.photos ?? [])]
  const users = options.users ?? {}
  const accounts = options.accounts ?? { 'sophie@exemple.test': USER }
  const calls: Call[] = []
  let deletedUser: string | null = null

  function call(kind: Call['kind'], arg: unknown) {
    calls.push({ kind, arg })
    if (options.failOn === kind) throw new Error(`${kind} injoignable`)
  }

  const ports: AccountDeletionPorts = {
    adminSecret: 'adminSecret' in options ? options.adminSecret : ADMIN_SECRET,
    async userIdFromToken(token) {
      return users[token] ?? null
    },
    async userIdByEmail(email) {
      call('lookup', email)
      return accounts[email] ?? null
    },
    async listPhotos(folder, limit) {
      call('list', { folder, limit })
      return childrenOf(photos, folder, limit)
    },
    async removePhotos(paths) {
      call('remove', paths)
      if (options.removeKeepsPhotos) return
      for (const path of paths) {
        const index = photos.indexOf(path.slice(USER.length + 1))
        if (index >= 0) photos.splice(index, 1)
      }
    },
    async deleteCloudBackup(userId) {
      call('backup', userId)
    },
    async deleteUser(userId) {
      call('deleteUser', userId)
      deletedUser = userId
    },
    async recordDeletion(origin) {
      call('record', origin)
    },
  }

  return { ports, calls, photos, deletedUser: () => deletedUser }
}
