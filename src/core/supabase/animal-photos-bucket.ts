export const ANIMAL_PHOTOS_BUCKET = 'animal-photos'

/** Storage répond en HTTP 400 à une photo absente : le vrai motif est dans `statusCode` ou `code`. */
export function isMissingPhotoObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { statusCode, code } = error as Record<string, unknown>
  return statusCode === '404' || code === 'NoSuchKey'
}
