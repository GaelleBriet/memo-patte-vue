import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import type { PhotoDeletePort } from './photo-delete-port'
import type { LocalPhotoFiles } from './photo-upload-port'
import type { SyncCycleOutbox } from './sync-cycle'

export interface PhotoRemovalDependencies {
  files: Pick<LocalPhotoFiles, 'exists'>
  deletes: PhotoDeletePort
  isPhotoInCarnet: (fileName: string) => Promise<boolean>
  /** Vrai si une ligne d'animal, supprimé compris, porte encore cette photo. */
  isPhotoKeptByAnimal: (fileName: string) => Promise<boolean>
}

export interface PhotoRemoval {
  /** Rend le premier échec à réessayer, `null` si aucun effacement n'en attend un. */
  remove(userId: string): Promise<{ cause: unknown } | null>
}

export function createPhotoRemoval(
  outbox: Pick<SyncCycleOutbox, 'listPending' | 'removeIfUnchanged' | 'recordFailedPush'>,
  { files, deletes, isPhotoInCarnet, isPhotoKeptByAnimal }: PhotoRemovalDependencies,
): PhotoRemoval {
  async function removeEntry(userId: string, entry: SyncOutboxEntry): Promise<void> {
    if (await isPhotoInCarnet(entry.entityId)) return
    // Tant que le fichier existe, « Annuler » peut rendre la photo sans la remettre en file.
    if (await files.exists(entry.entityId)) return
    if (!(await isPhotoKeptByAnimal(entry.entityId))) await deletes.delete(userId, entry.entityId)
    await outbox.removeIfUnchanged(entry)
  }

  return {
    async remove(userId) {
      const pending = await outbox.listPending()
      // Tant qu'une ligne d'animal n'est pas envoyée, celle du cloud peut encore désigner la photo.
      if (pending.some(({ entity }) => entity === 'animal')) return null

      let failure: { cause: unknown } | null = null
      for (const entry of pending.filter(({ entity }) => entity === ANIMAL_PHOTO_ENTITY)) {
        try {
          await removeEntry(userId, entry)
        } catch (cause) {
          await outbox.recordFailedPush(entry)
          failure ??= { cause }
        }
      }
      return failure
    },
  }
}
