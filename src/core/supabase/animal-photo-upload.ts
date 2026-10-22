import type { SupabaseClient } from '@supabase/supabase-js'

import { PhotoUploadRefusal, type PhotoUploadPort } from '@/core/sync/service/photo-upload-port'

const BUCKET = 'animal-photos'

/** Storage répond en HTTP 400 à presque tout refus : le vrai motif est dans `statusCode`. */
const DEFINITIVE_STATUS_CODES = new Set(['400', '413', '415'])

function definitiveRefusal(error: unknown): PhotoUploadRefusal | null {
  if (typeof error !== 'object' || error === null) return null
  const { statusCode, code } = error as { statusCode?: unknown; code?: unknown }
  if (typeof statusCode !== 'string' || !DEFINITIVE_STATUS_CODES.has(statusCode)) return null
  return new PhotoUploadRefusal(typeof code === 'string' ? `${statusCode} ${code}` : statusCode)
}

export function createAnimalPhotoUpload(
  loadClient: () => Promise<SupabaseClient>,
): PhotoUploadPort {
  return {
    async upload(userId, fileName, jpeg) {
      const supabase = await loadClient()
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${userId}/${fileName}`, jpeg, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw definitiveRefusal(error) ?? error
    },
  }
}
