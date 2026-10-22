import type { SupabaseClient } from '@supabase/supabase-js'

import type { PhotoDownloadPort } from '@/core/sync/service/photo-download-port'
import { ANIMAL_PHOTOS_BUCKET } from './animal-photos-bucket'

/** Storage répond en HTTP 400 à une photo absente : le vrai motif est dans `statusCode` ou `code`. */
function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { statusCode, code } = error as Record<string, unknown>
  return statusCode === '404' || code === 'NoSuchKey'
}

export function createAnimalPhotoDownload(
  loadClient: () => Promise<SupabaseClient>,
): PhotoDownloadPort {
  return {
    async download(userId, fileName) {
      const supabase = await loadClient()
      const { data, error } = await supabase.storage
        .from(ANIMAL_PHOTOS_BUCKET)
        .download(`${userId}/${fileName}`)
      if (error) {
        if (isMissingObject(error)) return null
        throw error
      }
      return new Uint8Array(await data.arrayBuffer())
    },
  }
}
