import {
  deletePartialPhoto,
  deletePhoto,
  listPartialPhotos,
  listPhotos,
  type StoredPhoto,
} from '@/core/photos/photo-storage'
import { getAnimalsRepository, type AnimalVersion } from '../repository/animals.repository'
import { errorSummary } from '@/shared/utils/error-summary'

type Provider<T> = () => T | Promise<T>

/** La photo s'écrit avant la ligne de son animal : une photo trop récente peut encore attendre la sienne. */
const RECENT_PHOTO_MS = 60_000

export function createOrphanPhotosCleanup(deps: {
  listPhotos: () => Promise<StoredPhoto[]>
  deletePhoto: (name: string) => Promise<void>
  listPartialPhotos: () => Promise<StoredPhoto[]>
  deletePartialPhoto: (name: string) => Promise<void>
  animals: Provider<{ listVersions: () => Promise<AnimalVersion[]> }>
}): () => Promise<void> {
  return async () => {
    const recentSince = Date.now() - RECENT_PHOTO_MS
    try {
      const interrupted = (await deps.listPartialPhotos()).filter(
        ({ modifiedAt }) => modifiedAt < recentSince,
      )
      for (const { name } of interrupted) {
        await deps.deletePartialPhoto(name).catch((cause: unknown) => {
          console.warn('Téléchargement interrompu non effacé :', errorSummary(cause))
        })
      }

      const photos = (await deps.listPhotos()).filter(({ modifiedAt }) => modifiedAt < recentSince)
      if (photos.length === 0) return

      const animals = await (await deps.animals()).listVersions()
      const kept = new Set(
        animals.filter((animal) => animal.deletedAt === null).map((animal) => animal.photoPath),
      )
      for (const { name } of photos.filter(({ name }) => !kept.has(name))) {
        await deps.deletePhoto(name).catch((cause: unknown) => {
          console.warn('Photo orpheline non effacée :', errorSummary(cause))
        })
      }
    } catch (cause) {
      console.warn('Nettoyage des photos orphelines impossible :', errorSummary(cause))
    }
  }
}

/**
 * Au démarrage : efface les photos qu'aucun animal non supprimé ne porte, et les téléchargements
 * interrompus. Ne lève pas.
 */
export const cleanOrphanPhotosOnLaunch = createOrphanPhotosCleanup({
  listPhotos,
  deletePhoto,
  listPartialPhotos,
  deletePartialPhoto,
  animals: getAnimalsRepository,
})
