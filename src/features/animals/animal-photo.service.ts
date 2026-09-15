import type { Animal, AnimalInput } from './animal.schema'
import type { AnimalsRepository } from './animals.repository'
import { deletePhoto, savePhoto, type PhotoStorage } from '@/core/photos/photo-storage'

export type PhotoChange =
  { kind: 'keep' } | { kind: 'replace'; base64: string } | { kind: 'remove' }

export function createAnimalPhotoService(storage: PhotoStorage) {
  async function writeNewPhoto(change: PhotoChange): Promise<string | null> {
    return change.kind === 'replace' ? storage.savePhoto(change.base64) : null
  }

  async function forget(name: string | null): Promise<void> {
    if (name === null) return
    try {
      await storage.deletePhoto(name)
    } catch {
      // Un fichier orphelin ne vaut pas l'échec d'un enregistrement déjà en base.
    }
  }

  async function withNewPhoto<T>(
    change: PhotoChange,
    save: (newPhoto: string | null) => Promise<T>,
  ): Promise<T> {
    const newPhoto = await writeNewPhoto(change)
    try {
      return await save(newPhoto)
    } catch (cause) {
      await forget(newPhoto)
      throw cause
    }
  }

  return {
    async create(
      repository: AnimalsRepository,
      input: AnimalInput,
      change: PhotoChange,
    ): Promise<Animal> {
      return withNewPhoto(change, (photoPath) => repository.create({ ...input, photoPath }))
    },

    /** Le `photoPath` de `input` est ignoré : seul `change` décide de la photo. */
    async update(
      repository: AnimalsRepository,
      id: string,
      input: AnimalInput,
      change: PhotoChange,
    ): Promise<Animal> {
      const existing = await repository.getById(id)
      if (!existing) throw new Error(`Animal introuvable : ${id}`)

      const animal = await withNewPhoto(change, (newPhoto) =>
        repository.update(id, {
          ...input,
          photoPath: change.kind === 'keep' ? existing.photoPath : newPhoto,
        }),
      )
      if (change.kind !== 'keep') await forget(existing.photoPath)
      return animal
    },
  }
}

export type AnimalPhotoService = ReturnType<typeof createAnimalPhotoService>

export const animalPhotoService = createAnimalPhotoService({ savePhoto, deletePhoto })
