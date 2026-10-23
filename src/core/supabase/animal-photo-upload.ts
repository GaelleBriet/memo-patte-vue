import type { SupabaseClient } from '@supabase/supabase-js'

import { PhotoUploadRefusal, type PhotoUploadPort } from '@/core/sync/service/photo-upload-port'
import { ANIMAL_PHOTOS_BUCKET } from './animal-photos-bucket'
import { PHOTO_TRANSFER_TIMEOUT_MS, withStorageTimeout } from './storage-timeout'

/** Storage répond en HTTP 400 à presque tout refus : le vrai motif est dans `statusCode` ou `code`. */
const DEFINITIVE_STATUS_CODES = new Set(['400', '413', '415'])
const DEFINITIVE_CODES = new Set(['EntityTooLarge', 'InvalidMimeType', 'InvalidKey'])

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

function definitiveRefusal(error: unknown): PhotoUploadRefusal | null {
  if (typeof error !== 'object' || error === null) return null
  const fields = error as { statusCode?: unknown; code?: unknown }
  const statusCode = text(fields.statusCode)
  const code = text(fields.code)
  const definitive =
    (statusCode !== null && DEFINITIVE_STATUS_CODES.has(statusCode)) ||
    (code !== null && DEFINITIVE_CODES.has(code))
  if (!definitive) return null
  return new PhotoUploadRefusal([statusCode, code].filter((part) => part !== null).join(' '))
}

export function createAnimalPhotoUpload(
  loadClient: () => Promise<SupabaseClient>,
): PhotoUploadPort {
  return {
    async upload(userId, fileName, jpeg) {
      const supabase = await loadClient()
      const { error } = await withStorageTimeout(
        supabase.storage
          .from(ANIMAL_PHOTOS_BUCKET)
          .upload(`${userId}/${fileName}`, jpeg, { upsert: true, contentType: 'image/jpeg' }),
        PHOTO_TRANSFER_TIMEOUT_MS,
      )
      if (error) throw definitiveRefusal(error) ?? error
    },
  }
}
