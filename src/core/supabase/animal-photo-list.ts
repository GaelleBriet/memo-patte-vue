import type { SupabaseClient } from '@supabase/supabase-js'

import type { CloudPhotoObject, PhotoListPort } from '@/core/sync/service/photo-list-port'
import { ANIMAL_PHOTOS_BUCKET } from './animal-photos-bucket'
import { PHOTO_LIST_TIMEOUT_MS, withStorageTimeout } from './storage-timeout'

export const ANIMAL_PHOTO_LIST_PAGE_SIZE = 100
const MAX_PAGES = 50

interface ListedObject {
  name: string
  id: string | null
  created_at: string | null
  updated_at: string | null
}

export function createAnimalPhotoList(loadClient: () => Promise<SupabaseClient>): PhotoListPort {
  return {
    async list(userId) {
      const supabase = await loadClient()
      const objects: CloudPhotoObject[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await withStorageTimeout(
          supabase.storage.from(ANIMAL_PHOTOS_BUCKET).list(userId, {
            limit: ANIMAL_PHOTO_LIST_PAGE_SIZE,
            offset: page * ANIMAL_PHOTO_LIST_PAGE_SIZE,
            sortBy: { column: 'name', order: 'asc' },
          }),
          PHOTO_LIST_TIMEOUT_MS,
        )
        if (error) throw error
        const listed = (data ?? []) as ListedObject[]
        for (const { name, id, created_at, updated_at } of listed) {
          if (id !== null) objects.push({ name, createdAt: created_at, updatedAt: updated_at })
        }
        if (listed.length < ANIMAL_PHOTO_LIST_PAGE_SIZE) return objects
      }
      throw new Error('Dossier de photos du cloud trop long pour être listé en entier.')
    },
  }
}
