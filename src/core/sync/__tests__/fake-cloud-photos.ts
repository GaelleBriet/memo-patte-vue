import { vi } from 'vitest'

import type { PhotoDeletePort } from '../service/photo-delete-port'
import type { CloudPhotoObject, PhotoListPort } from '../service/photo-list-port'
import type { SyncableTable } from '../service/syncable-table'

export interface CloudAnimal {
  id: string
  photo_path: string | null
  deleted_at: string | null
  /** `server_updated_at` de la ligne. */
  stamp: string
}

/** Table `animal` du cloud, lue comme le fait `pullPage` : ordre `(server_updated_at, id)`. */
export function fakeCloudAnimals(rows: CloudAnimal[]) {
  const sorted = rows.toSorted((a, b) => a.stamp.localeCompare(b.stamp) || a.id.localeCompare(b.id))
  return {
    pullPage: vi.fn<SyncableTable['pullPage']>(async (_userId, since, limit, afterId) => {
      const page = sorted
        .filter(({ stamp, id }) =>
          afterId === undefined
            ? stamp >= since
            : stamp > since || (stamp === since && id > afterId),
        )
        .slice(0, limit)
      return {
        rows: page.map(({ stamp, ...row }) => ({ ...row, updated_at: stamp })),
        stamps: page.map(({ stamp }) => stamp),
        cursor: page.at(-1)?.stamp ?? null,
      }
    }),
  }
}

/** Dossier cloud du compte : la liste et l'effacement, sans réseau. */
export function fakePhotoStorage(initial: CloudPhotoObject[]) {
  let objects = [...initial]
  const deleted: string[] = []
  const failures = new Map<string, () => unknown>()
  const storage = {
    deleted,
    failures,
    onDelete: undefined as (() => void) | undefined,
    list: vi.fn<PhotoListPort['list']>(async () => objects.map((object) => ({ ...object }))),
    delete: vi.fn<PhotoDeletePort['delete']>(async (_userId, fileName) => {
      const failure = failures.get(fileName)
      if (failure) throw failure()
      objects = objects.filter(({ name }) => name !== fileName)
      deleted.push(fileName)
      storage.onDelete?.()
    }),
  }
  return storage
}
