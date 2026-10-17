// @vitest-environment node
import { ZodError } from 'zod'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { Animal, AnimalInput } from '../schema/animal.schema'
import { createAnimalPhotoService, type PhotoChange } from '../service/animal-photo.service'
import { createAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'
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
  service = createAnimalPhotoService(storage, () => repository)
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

    const animal = await service.update(milo.id, MILO, NOUVELLE)

    expect(animal.photoPath).toBe('photo-2.jpg')
    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-1.jpg')
  })

  it('retirer la photo remet photoPath à null et supprime le fichier', async () => {
    const milo = await miloAvecPhoto()

    const animal = await service.update(milo.id, MILO, { kind: 'remove' })

    expect(animal.photoPath).toBeNull()
    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-1.jpg')
  })

  it('retirer la photo d’un animal qui n’en a pas ne supprime rien', async () => {
    const milo = await service.create(repository, MILO, { kind: 'keep' })

    await service.update(milo.id, MILO, { kind: 'remove' })

    expect(storage.deletePhoto).not.toHaveBeenCalled()
  })

  it('un échec d’enregistrement supprime la nouvelle photo et garde l’ancienne', async () => {
    const milo = await miloAvecPhoto()

    await expect(service.update(milo.id, { name: '', species: 'dog' }, NOUVELLE)).rejects.toThrow(
      ZodError,
    )

    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-2.jpg')
    expect((await repository.getById(milo.id))?.photoPath).toBe('photo-1.jpg')
  })

  it('un ancien fichier impossible à supprimer ne fait pas échouer l’enregistrement', async () => {
    const milo = await miloAvecPhoto()
    storage.deletePhoto.mockRejectedValue(new Error('fichier absent'))

    const animal = await service.update(milo.id, MILO, NOUVELLE)

    expect(animal.photoPath).toBe('photo-2.jpg')
  })

  it('refuse un animal inconnu sans écrire de photo', async () => {
    await expect(
      service.update('11111111-1111-4111-8111-111111111111', MILO, NOUVELLE),
    ).rejects.toThrow('Animal introuvable')

    expect(storage.savePhoto).not.toHaveBeenCalled()
  })
})

describe('retrait réversible', () => {
  it('retire la photo de l’animal sans effacer son fichier', async () => {
    const milo = await miloAvecPhoto()

    const removal = await service.detach(milo.id, MILO)

    expect(removal).toEqual({ animalId: milo.id, photoPath: 'photo-1.jpg' })
    expect((await repository.getById(milo.id))?.photoPath).toBeNull()
    expect(storage.deletePhoto).not.toHaveBeenCalled()
  })

  it('ne retire rien d’un animal sans photo', async () => {
    const milo = await service.create(repository, MILO, { kind: 'keep' })

    expect(await service.detach(milo.id, MILO)).toBeNull()
  })

  it('« Annuler » rend la même photo et garde son fichier', async () => {
    const milo = await miloAvecPhoto()
    const removal = await service.detach(milo.id, MILO)

    const animal = await service.reattach({ ...MILO, name: 'Milou' }, removal!)

    expect(animal.photoPath).toBe('photo-1.jpg')
    expect(animal.name).toBe('Milou')
    expect(storage.deletePhoto).not.toHaveBeenCalled()
  })

  it('« Annuler » garde une photo choisie entre-temps et efface l’ancienne', async () => {
    const milo = await miloAvecPhoto()
    const removal = await service.detach(milo.id, MILO)
    await service.update(milo.id, MILO, NOUVELLE)

    const animal = await service.reattach(MILO, removal!)

    expect(animal.photoPath).toBe('photo-2.jpg')
    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-1.jpg')
  })

  it('efface le fichier une fois le retrait définitif', async () => {
    const milo = await miloAvecPhoto()
    const removal = await service.detach(milo.id, MILO)

    await service.forgetRemoved(removal!)

    expect(storage.deletePhoto).toHaveBeenCalledExactlyOnceWith('photo-1.jpg')
  })

  it('n’efface pas un fichier que l’animal porte de nouveau', async () => {
    const milo = await miloAvecPhoto()
    const removal = await service.detach(milo.id, MILO)
    await service.reattach(MILO, removal!)

    await service.forgetRemoved(removal!)

    expect(storage.deletePhoto).not.toHaveBeenCalled()
  })

  it('un fichier impossible à effacer ne lève pas', async () => {
    const milo = await miloAvecPhoto()
    const removal = await service.detach(milo.id, MILO)
    storage.deletePhoto.mockRejectedValue(new Error('fichier absent'))

    await expect(service.forgetRemoved(removal!)).resolves.toBeUndefined()
  })
})

describe('fabrique du repository', () => {
  it('redemande le repository à chaque opération : une ouverture ratée n’est pas mise en cache', async () => {
    const milo = await miloAvecPhoto()
    const open = vi
      .fn<() => Promise<AnimalsRepository>>()
      .mockRejectedValueOnce(new Error('base fermée'))
      .mockResolvedValue(repository)
    const lazy = createAnimalPhotoService(storage, open)

    await expect(lazy.detach(milo.id, MILO)).rejects.toThrow('base fermée')
    await expect(lazy.detach(milo.id, MILO)).resolves.toEqual({
      animalId: milo.id,
      photoPath: 'photo-1.jpg',
    })
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('forgetRemoved rejette quand la fabrique échoue', async () => {
    const lazy = createAnimalPhotoService(storage, () => Promise.reject(new Error('base fermée')))

    await expect(
      lazy.forgetRemoved({
        animalId: '11111111-1111-4111-8111-111111111111',
        photoPath: 'photo-1.jpg',
      }),
    ).rejects.toThrow('base fermée')
  })

  it('n’ouvre pas la base pour une création', async () => {
    const open = vi.fn<() => Promise<AnimalsRepository>>()
    const lazy = createAnimalPhotoService(storage, open)

    await lazy.create(repository, MILO, { kind: 'keep' })

    expect(open).not.toHaveBeenCalled()
  })
})
