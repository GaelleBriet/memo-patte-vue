import type { Animal, AnimalInput } from '../schema/animal.schema'
import type { AnimalsRepository } from '../repository/animals.repository'
import { deletePhoto, savePhoto, type PhotoStorage } from '@/core/photos/photo-storage'

export type PhotoChange =
  { kind: 'keep' } | { kind: 'replace'; base64: string } | { kind: 'remove' }

/** Ce que `reattach` et `forgetRemoved` reprennent d'un retrait. */
export type PhotoRemoval = { animalId: string; photoPath: string }

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
    async create<Input extends AnimalInput>(
      creator: { create(input: Input): Promise<Animal> },
      input: Input,
      change: PhotoChange,
    ): Promise<Animal> {
      return withNewPhoto(change, (photoPath) => creator.create({ ...input, photoPath }))
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

    /** Retire la photo en gardant son fichier pour `reattach` ; `null` pour un animal sans photo. */
    async detach(
      repository: AnimalsRepository,
      id: string,
      input: AnimalInput,
    ): Promise<PhotoRemoval | null> {
      const existing = await repository.getById(id)
      if (!existing) throw new Error(`Animal introuvable : ${id}`)
      if (existing.photoPath === null) return null

      await repository.update(id, { ...input, photoPath: null })
      return { animalId: id, photoPath: existing.photoPath }
    },

    /** Rend la photo retirée, sauf si une autre a été choisie depuis : l'ancienne est alors effacée. */
    async reattach(
      repository: AnimalsRepository,
      input: AnimalInput,
      { animalId, photoPath }: PhotoRemoval,
    ): Promise<Animal> {
      const existing = await repository.getById(animalId)
      if (!existing) throw new Error(`Animal introuvable : ${animalId}`)
      if (existing.photoPath !== null) {
        await forget(photoPath)
        return existing
      }
      return repository.update(animalId, { ...input, photoPath })
    },

    /** Efface le fichier d'une photo retirée que l'animal ne porte plus ; ne lève pas. */
    async forgetRemoved(
      repository: AnimalsRepository,
      { animalId, photoPath }: PhotoRemoval,
    ): Promise<void> {
      try {
        if ((await repository.getById(animalId))?.photoPath === photoPath) return
        await storage.deletePhoto(photoPath)
      } catch {
        // Un fichier orphelin ne vaut pas une erreur après un retrait déjà en base.
      }
    },
  }
}

export type AnimalPhotoService = ReturnType<typeof createAnimalPhotoService>

export const animalPhotoService = createAnimalPhotoService({ savePhoto, deletePhoto })
