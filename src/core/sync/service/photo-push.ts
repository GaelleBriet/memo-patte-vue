import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { errorSummary } from '@/shared/utils/error-summary'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import { isJpeg, MAX_CLOUD_PHOTO_BYTES } from './cloud-photo'
import { PhotoUploadRefusal, type LocalPhotoFiles, type PhotoUploadPort } from './photo-upload-port'
import { createPushRefusals } from './push-refusals'
import type { SyncCycleOutbox } from './sync-cycle'

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

const photoRefusalSignature = (cause: unknown) =>
  cause instanceof PhotoUploadRefusal ? cause.reason : null

export function createPhotoPush(
  outbox: Pick<
    SyncCycleOutbox,
    | 'listPending'
    | 'removeIfUnchanged'
    | 'markRefusedIfUnchanged'
    | 'recordFailedPush'
    | 'markRefusedWithRefusedAncestor'
  >,
  { files, uploads, isPhotoInCarnet }: PhotoPushDependencies,
  now: () => Date,
): PhotoPush {
  const refusals = createPushRefusals({
    outbox,
    signature: photoRefusalSignature,
    onGivenUp: (_entry, cause) =>
      console.warn('Photo refusée par le serveur, plus envoyée :', errorSummary(cause)),
    now,
  })

  async function pushEntry(userId: string, entry: SyncOutboxEntry): Promise<void> {
    if (!(await isPhotoInCarnet(entry.entityId))) return
    const photo = await files.read(entry.entityId, MAX_CLOUD_PHOTO_BYTES)
    if (photo.kind === 'too-large' || (photo.kind === 'found' && !isJpeg(photo.bytes))) {
      console.warn('Photo trop lourde ou hors JPEG, plus envoyée.')
      await outbox.markRefusedIfUnchanged(entry, now().toISOString())
      return
    }
    if (photo.kind === 'found') {
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
