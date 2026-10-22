import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { errorSummary } from '@/shared/utils/error-summary'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import { PhotoUploadRefusal, type LocalPhotoFiles, type PhotoUploadPort } from './photo-upload-port'
import { createPushRefusals } from './push-refusals'
import type { SyncCycleOutbox } from './sync-cycle'

/** Limite du bucket `animal-photos` : au-delà, le serveur refuserait à chaque essai. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

export interface PhotoPushDependencies {
  files: LocalPhotoFiles
  uploads: PhotoUploadPort
  /** Vrai si un animal non supprimé porte encore cette photo. */
  isPhotoInCarnet: (fileName: string) => Promise<boolean>
}

export interface PhotoPush {
  /** Rend le premier échec à réessayer, `null` si aucune photo n'en attend un. */
  push(userId: string): Promise<{ cause: unknown } | null>
}

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

const photoRefusalSignature = (cause: unknown) =>
  cause instanceof PhotoUploadRefusal ? cause.reason : null

export function createPhotoPush(
  outbox: Pick<SyncCycleOutbox, 'listPending' | 'removeIfUnchanged' | 'recordFailedPush'>,
  { files, uploads, isPhotoInCarnet }: PhotoPushDependencies,
): PhotoPush {
  const refusals = createPushRefusals({
    outbox,
    signature: photoRefusalSignature,
    onGivenUp: (_entry, cause) =>
      console.warn('Photo refusée par le serveur, sortie de la file :', errorSummary(cause)),
  })

  async function pushEntry(userId: string, entry: SyncOutboxEntry): Promise<void> {
    if (!(await isPhotoInCarnet(entry.entityId))) {
      // Tant que le fichier existe, « Annuler » peut rendre l'animal ou la photo sans la remettre en file.
      if (!(await files.exists(entry.entityId))) await outbox.removeIfUnchanged(entry)
      return
    }
    const photo = await files.read(entry.entityId, MAX_PHOTO_BYTES)
    if (photo.kind === 'too-large' || (photo.kind === 'found' && !isJpeg(photo.bytes))) {
      console.warn('Photo trop lourde ou hors JPEG, sortie de la file sans envoi.')
    } else if (photo.kind === 'found') {
      await uploads.upload(userId, entry.entityId, photo.bytes)
    }
    await outbox.removeIfUnchanged(entry)
  }

  return {
    async push(userId) {
      let failure: { cause: unknown } | null = null
      const pending = (await outbox.listPending()).filter(
        ({ entity }) => entity === ANIMAL_PHOTO_ENTITY,
      )
      for (const entry of pending) {
        try {
          await pushEntry(userId, entry)
          refusals.forget(entry)
        } catch (cause) {
          if (await refusals.recordFailure(entry, cause)) failure ??= { cause }
        }
      }
      return failure
    },
  }
}
