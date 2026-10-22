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
  { files, uploads }: PhotoPushDependencies,
): PhotoPush {
  const refusals = createPushRefusals(photoRefusalSignature)

  /** Rend vrai si l'entrée reste en file pour un prochain essai. */
  async function recordFailure(entry: SyncOutboxEntry, cause: unknown): Promise<boolean> {
    await outbox.recordFailedPush(entry)
    if (!refusals.isGivenUp(entry, cause)) return true
    await outbox.removeIfUnchanged(entry)
    console.warn('Photo refusée par le serveur, sortie de la file :', errorSummary(cause))
    return false
  }

  async function pushEntry(userId: string, entry: SyncOutboxEntry): Promise<void> {
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
          if (await recordFailure(entry, cause)) failure ??= { cause }
        }
      }
      return failure
    },
  }
}
