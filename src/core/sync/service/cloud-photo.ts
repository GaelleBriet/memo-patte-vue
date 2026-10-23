/** Limite du bucket `animal-photos` : au-delà, le serveur refuserait à chaque essai. */
export const MAX_CLOUD_PHOTO_BYTES = 2 * 1024 * 1024

export const isJpeg = (bytes: Uint8Array) =>
  bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

/** Une ligne d'un autre appareil peut encore ramener la photo remplacée : le cloud la garde une semaine. */
export const PHOTO_CLOUD_GRACE_MS = 7 * 24 * 60 * 60 * 1000
