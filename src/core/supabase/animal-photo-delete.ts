import type { SupabaseClient } from '@supabase/supabase-js'

import type { PhotoDeletePort } from '@/core/sync/service/photo-delete-port'
import { ANIMAL_PHOTOS_BUCKET, isMissingPhotoObject } from './animal-photos-bucket'
import { PHOTO_DELETE_TIMEOUT_MS, withStorageTimeout } from './storage-timeout'

export function createAnimalPhotoDelete(
  loadClient: () => Promise<SupabaseClient>,
): PhotoDeletePort {
  return {
    async delete(userId, fileName) {
      const supabase = await loadClient()
      const { data, error } = await withStorageTimeout(
        supabase.storage.from(ANIMAL_PHOTOS_BUCKET).remove([`${userId}/${fileName}`]),
        PHOTO_DELETE_TIMEOUT_MS,
      )
      if (error) {
        if (isMissingPhotoObject(error)) return
        throw error
      }
      if (data !== null && data.length > 0) return
      // Storage rend la même réponse vide pour un objet absent et pour un refus de la RLS.
      const { data: session } = await supabase.auth.getSession()
      if (session.session?.user.id !== userId) {
        throw new Error('Session absente ou d’un autre compte : effacement de photo à réessayer.')
      }
    },
  }
}
