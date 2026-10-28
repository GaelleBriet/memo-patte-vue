// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createCarnetPhotosRepository,
  type CarnetPhotosRepository,
} from '../repository/carnet-photos.repository'
import { ANIMAL_ID, createSyncTestDb, insertAnimal, setAnimalPhoto } from './sync-test-db'

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-01-01T00:05:00.000Z'
const PHOTO_MILO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const PHOTO_PIRATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'

describe('carnetPhotosRepository', () => {
  let db: InMemoryDb
  let repository: CarnetPhotosRepository

  beforeEach(async () => {
    db = await createSyncTestDb()
    repository = createCarnetPhotosRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('isPhotoInCarnet', () => {
    it('vrai pour la photo d’un animal non supprimé', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)

      await expect(repository.isPhotoInCarnet(PHOTO_MILO)).resolves.toBe(true)
    })

    it('faux pour une photo retirée, remplacée ou inconnue', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await setAnimalPhoto(db, ANIMAL_ID, PHOTO_PIRATE, T2)

      await expect(repository.isPhotoInCarnet(PHOTO_MILO)).resolves.toBe(false)
      await setAnimalPhoto(db, ANIMAL_ID, null, T2)
      await expect(repository.isPhotoInCarnet(PHOTO_PIRATE)).resolves.toBe(false)
    })

    it('compare le nom à l’identique : `_` n’y vaut pas n’importe quel caractère', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', 'aXb.jpg')

      await expect(repository.isPhotoInCarnet('a_b.jpg')).resolves.toBe(false)
      await expect(repository.isPhotoInCarnet('aXb.jpg')).resolves.toBe(true)
    })

    it('faux pour la photo d’un animal supprimé', async () => {
      await insertAnimal(db, 'parti', T1, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])

      await expect(repository.isPhotoInCarnet(PHOTO_PIRATE)).resolves.toBe(false)
    })
  })

  describe('isPhotoKeptByAnimal', () => {
    it('vrai pour la photo d’un animal non supprimé ou supprimé, qui peut revenir', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await insertAnimal(db, 'parti', T1, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])

      await expect(repository.isPhotoKeptByAnimal(PHOTO_MILO)).resolves.toBe(true)
      await expect(repository.isPhotoKeptByAnimal(PHOTO_PIRATE)).resolves.toBe(true)
    })

    it('faux pour une photo remplacée, retirée ou inconnue', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await setAnimalPhoto(db, ANIMAL_ID, PHOTO_PIRATE, T2)

      await expect(repository.isPhotoKeptByAnimal(PHOTO_MILO)).resolves.toBe(false)
      await setAnimalPhoto(db, ANIMAL_ID, null, T2)
      await expect(repository.isPhotoKeptByAnimal(PHOTO_PIRATE)).resolves.toBe(false)
    })

    it('compare le nom à l’identique : `_` n’y vaut pas n’importe quel caractère', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', 'aXb.jpg')

      await expect(repository.isPhotoKeptByAnimal('a_b.jpg')).resolves.toBe(false)
    })
  })

  describe('listCarnetPhotos', () => {
    it('rend une fois chaque photo des animaux non supprimés, ni celle d’un animal supprimé ni une photo retirée', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await insertAnimal(db, 'jumeau', T1, 'Milo bis', PHOTO_MILO)
      await insertAnimal(db, 'parti', T1, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])
      await insertAnimal(db, 'sans-photo', T1, 'Luna')

      await expect(repository.listCarnetPhotos()).resolves.toEqual([PHOTO_MILO])
    })
  })

  describe('listKeptPhotos', () => {
    it('rend une fois chaque photo portée par une ligne d’animal, supprimé compris', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await insertAnimal(db, 'jumeau', T1, 'Milo bis', PHOTO_MILO)
      await insertAnimal(db, 'parti', T1, 'Pirate', PHOTO_PIRATE)
      await db.run("UPDATE animal SET deleted_at = ? WHERE id = 'parti'", [T2])
      await insertAnimal(db, 'sans-photo', T1, 'Luna')

      const kept = await repository.listKeptPhotos()

      expect(kept.toSorted()).toEqual([PHOTO_MILO, PHOTO_PIRATE].toSorted())
    })

    it('ne rend plus une photo remplacée ou retirée', async () => {
      await insertAnimal(db, ANIMAL_ID, T1, 'Milo', PHOTO_MILO)
      await setAnimalPhoto(db, ANIMAL_ID, PHOTO_PIRATE, T2)

      await expect(repository.listKeptPhotos()).resolves.toEqual([PHOTO_PIRATE])
      await setAnimalPhoto(db, ANIMAL_ID, null, T2)
      await expect(repository.listKeptPhotos()).resolves.toEqual([])
    })
  })
})
