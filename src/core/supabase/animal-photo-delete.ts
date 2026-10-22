import type { SupabaseClient } from '@supabase/supabase-js'

import type { PhotoDeletePort } from '@/core/sync/service/photo-delete-port'
import { ANIMAL_PHOTOS_BUCKET, isMissingPhotoObject } from './animal-photos-bucket'

export function createAnimalPhotoDelete(
  loadClient: () => Promise<SupabaseClient>,
): PhotoDeletePort {
  return {
    async delete(userId, fileName) {
      const supabase = await loadClient()
      const { error } = await supabase.storage
        .from(ANIMAL_PHOTOS_BUCKET)
        .remove([`${userId}/${fileName}`])
      if (error && !isMissingPhotoObject(error)) throw error
    },
  }
}
