/** Limite du bucket `animal-photos` : au-delà, le serveur refuserait à chaque essai. */
export const MAX_CLOUD_PHOTO_BYTES = 2 * 1024 * 1024

export const isJpeg = (bytes: Uint8Array) =>
  bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
