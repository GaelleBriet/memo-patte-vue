import type { SupabaseClient } from '@supabase/supabase-js'

import type { PhotoDownloadPort } from '@/core/sync/service/photo-download-port'
import { ANIMAL_PHOTOS_BUCKET, isMissingPhotoObject } from './animal-photos-bucket'
import { PHOTO_TRANSFER_TIMEOUT_MS, withStorageTimeout } from './storage-timeout'

export function createAnimalPhotoDownload(
  loadClient: () => Promise<SupabaseClient>,
): PhotoDownloadPort {
  return {
    async download(userId, fileName) {
      const supabase = await loadClient()
      const { data, error } = await withStorageTimeout(
        supabase.storage.from(ANIMAL_PHOTOS_BUCKET).download(`${userId}/${fileName}`),
        PHOTO_TRANSFER_TIMEOUT_MS,
      )
      if (error) {
        if (isMissingPhotoObject(error)) return null
        throw error
      }
      return new Uint8Array(await data.arrayBuffer())
    },
  }
}
