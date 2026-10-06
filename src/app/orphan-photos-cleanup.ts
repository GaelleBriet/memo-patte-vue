import { deletePhoto, listPhotos } from '@/core/photos/photo-storage'
import {
  getAnimalsRepository,
  type AnimalVersion,
} from '@/features/animals/repository/animals.repository'

type Provider<T> = () => T | Promise<T>

export function createOrphanPhotosCleanup(deps: {
  listPhotos: () => Promise<string[]>
  deletePhoto: (name: string) => Promise<void>
  animals: Provider<{ listVersions: () => Promise<AnimalVersion[]> }>
}): () => Promise<void> {
  return async () => {
    try {
      // Les photos d'abord : une photo enregistrée pendant le nettoyage n'est pas dans la liste.
      const photos = await deps.listPhotos()
      if (photos.length === 0) return

      const animals = await (await deps.animals()).listVersions()
      const kept = new Set(
        animals.filter((animal) => animal.deletedAt === null).map((animal) => animal.photoPath),
      )
      for (const photo of photos.filter((name) => !kept.has(name))) {
        await deps.deletePhoto(photo).catch((cause: unknown) => {
          console.warn('Photo orpheline non effacée :', cause)
        })
      }
    } catch (cause) {
      console.warn('Nettoyage des photos orphelines impossible :', cause)
    }
  }
}

/** Au démarrage : efface les photos qu'aucun animal non supprimé ne porte. Ne lève pas. */
export const cleanOrphanPhotosOnLaunch = createOrphanPhotosCleanup({
  listPhotos,
  deletePhoto,
  animals: getAnimalsRepository,
})
