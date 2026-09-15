// @vitest-environment node
import { ZodError } from 'zod'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { Animal, AnimalInput } from '../animal.schema'
import { createAnimalPhotoService, type PhotoChange } from '../animal-photo.service'
import { createAnimalsRepository, type AnimalsRepository } from '../animals.repository'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { PhotoStorage } from '@/core/photos/photo-storage'

const MILO: AnimalInput = { name: 'Milo', species: 'dog' }
const NOUVELLE: PhotoChange = { kind: 'replace', base64: 'Tk9VVkVMTEU=' }

let db: InMemoryDb
let repository: AnimalsRepository
let storage: {
  savePhoto: Mock<PhotoStorage['savePhoto']>
  deletePhoto: Mock<PhotoStorage['deletePhoto']>
}
let service: ReturnType<typeof createAnimalPhotoService>
let savedNames: string[]

beforeEach(async () => {
  db = await createInMemoryDb()
  repository = createAnimalsRepository(db)
  savedNames = []
  storage = {
    savePhoto: vi.fn<PhotoStorage['savePhoto']>(async () => {
      const name = `photo-${savedNames.length + 1}.jpg`
      savedNames.push(name)
      return name
    }),
    deletePhoto: vi.fn<PhotoStorage['deletePhoto']>(async () => {}),
  }
  service = createAnimalPhotoService(storage)
})

afterEach(() => {
  db.close()
})

async function miloAvecPhoto(): Promise<Animal> {
  return service.create(repository, MILO, NOUVELLE)
}

describe('création', () => {
  it('sans photo, n’écrit aucun fichier et laisse photoPath à null', async () => {
    const animal = await service.create(repository, MILO, { kind: 'keep' })

    expect(animal.photoPath).toBeNull()
    expect(storage.savePhoto).not.toHaveBeenCalled()
  })

  it('écrit la photo puis ne persiste que son nom de fichier', async () => {
    const animal = await miloAvecPhoto()

    expect(storage.savePhoto).toHaveBeenCalledExactlyOnceWith('Tk9VVkVMTEU=')
    expect(animal.photoPath).toBe('photo-1.jpg')
    expect((await repository.getById(animal.id))?.photoPath).toBe('photo-1.jpg')
  })

  it('supprime la photo écrite si l’animal n’a pas pu être créé', async () => {
    await expect(
      service.create(repository, { name: '', species: 'dog' }, NOUVELLE),
    ).rejects.toThrow(ZodError)

    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-1.jpg')
  })
})

describe('édition', () => {
  it('garde la photo existante quand le formulaire n’y touche pas', async () => {
    const milo = await miloAvecPhoto()

    const animal = await service.update(
      repository,
      milo.id,
      { ...MILO, name: 'Milou', photoPath: null },
      { kind: 'keep' },
    )

    expect(animal.name).toBe('Milou')
    expect(animal.photoPath).toBe('photo-1.jpg')
    expect(storage.deletePhoto).not.toHaveBeenCalled()
  })

  it('remplacer la photo écrit la nouvelle et supprime l’ancienne', async () => {
    const milo = await miloAvecPhoto()

    const animal = await service.update(repository, milo.id, MILO, NOUVELLE)

    expect(animal.photoPath).toBe('photo-2.jpg')
    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-1.jpg')
  })

  it('retirer la photo remet photoPath à null et supprime le fichier', async () => {
    const milo = await miloAvecPhoto()

    const animal = await service.update(repository, milo.id, MILO, { kind: 'remove' })

    expect(animal.photoPath).toBeNull()
    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-1.jpg')
  })

  it('retirer la photo d’un animal qui n’en a pas ne supprime rien', async () => {
    const milo = await service.create(repository, MILO, { kind: 'keep' })

    await service.update(repository, milo.id, MILO, { kind: 'remove' })

    expect(storage.deletePhoto).not.toHaveBeenCalled()
  })

  it('un échec d’enregistrement supprime la nouvelle photo et garde l’ancienne', async () => {
    const milo = await miloAvecPhoto()

    await expect(
      service.update(repository, milo.id, { name: '', species: 'dog' }, NOUVELLE),
    ).rejects.toThrow(ZodError)

    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-2.jpg')
    expect((await repository.getById(milo.id))?.photoPath).toBe('photo-1.jpg')
  })

  it('un ancien fichier impossible à supprimer ne fait pas échouer l’enregistrement', async () => {
    const milo = await miloAvecPhoto()
    storage.deletePhoto.mockRejectedValue(new Error('fichier absent'))

    const animal = await service.update(repository, milo.id, MILO, NOUVELLE)

    expect(animal.photoPath).toBe('photo-2.jpg')
  })

  it('refuse un animal inconnu sans écrire de photo', async () => {
    await expect(
      service.update(repository, '11111111-1111-4111-8111-111111111111', MILO, NOUVELLE),
    ).rejects.toThrow('Animal introuvable')

    expect(storage.savePhoto).not.toHaveBeenCalled()
  })
})
