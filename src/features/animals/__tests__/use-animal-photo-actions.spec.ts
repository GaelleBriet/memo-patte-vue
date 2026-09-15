import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ref } from 'vue'

import type { Animal, AnimalInput } from '../animal.schema'
import type { PhotoChange } from '../animal-photo.service'
import { useAnimalsStore } from '../animals.store'
import { useAnimalPhotoActions } from '../use-animal-photo-actions'
import { pickPhoto, type PickedPhoto } from '@/core/photos/photo-picker'

vi.mock('@/core/photos/photo-picker', () => ({
  pickPhoto: vi.fn<() => Promise<PickedPhoto | null>>(),
}))

const choisirPhoto = vi.mocked(pickPhoto)

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: 'Labrador',
  birthDate: '2023-03-12',
  initialWeightKg: 8.5,
  photoPath: 'milo.jpg',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

const PHOTO: PickedPhoto = { base64: 'TUlMTw==', previewUrl: 'data:image/jpeg;base64,TUlMTw==' }

let update: MockInstance<(id: string, input: AnimalInput, photo?: PhotoChange) => Promise<Animal>>

beforeEach(() => {
  choisirPhoto.mockReset()
  setActivePinia(createPinia())
  update = vi.spyOn(useAnimalsStore(), 'update').mockResolvedValue(MILO)
})

function actions(animal: Animal | null = MILO) {
  return useAnimalPhotoActions(ref(animal))
}

describe('useAnimalPhotoActions', () => {
  it('enregistre aussitôt la photo choisie, en gardant la fiche telle quelle', async () => {
    choisirPhoto.mockResolvedValue(PHOTO)
    const { changePhoto } = actions()

    expect(await changePhoto()).toBe(true)

    expect(update).toHaveBeenCalledExactlyOnceWith(
      MILO.id,
      {
        name: 'Milo',
        species: 'dog',
        breed: 'Labrador',
        birthDate: '2023-03-12',
        initialWeightKg: 8.5,
      },
      { kind: 'replace', base64: 'TUlMTw==' },
    )
  })

  it('n’enregistre rien quand le sélecteur est fermé sans choix', async () => {
    choisirPhoto.mockResolvedValue(null)
    const { changePhoto, error } = actions()

    expect(await changePhoto()).toBe(false)

    expect(update).not.toHaveBeenCalled()
    expect(error.value).toBeNull()
  })

  it('retire la photo', async () => {
    const { removePhoto } = actions()

    expect(await removePhoto()).toBe(true)

    expect(update).toHaveBeenCalledExactlyOnceWith(MILO.id, expect.anything(), { kind: 'remove' })
  })

  it('ignore un second déclenchement tant que le premier n’est pas fini', async () => {
    let terminer: (photo: PickedPhoto | null) => void = () => {}
    choisirPhoto.mockReturnValue(new Promise((resolve) => (terminer = resolve)))
    const { changePhoto, removePhoto, isBusy } = actions()

    const premier = changePhoto()
    expect(isBusy.value).toBe(true)
    expect(await changePhoto()).toBe(false)
    expect(await removePhoto()).toBe(false)

    terminer(PHOTO)
    await premier
    await flushPromises()

    expect(choisirPhoto).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()
    expect(isBusy.value).toBe(false)
  })

  it('signale une photo illisible par le même message que le formulaire', async () => {
    choisirPhoto.mockRejectedValue(new Error('Not implemented'))
    const { changePhoto, error, isBusy } = actions()

    expect(await changePhoto()).toBe(false)

    expect(error.value).toBe('animals.form.errors.photo')
    expect(isBusy.value).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('signale un enregistrement en échec', async () => {
    update.mockRejectedValue(new Error('base verrouillée'))
    const { removePhoto, error } = actions()

    expect(await removePhoto()).toBe(false)

    expect(error.value).toBe('animals.form.errors.save')
  })

  it('efface l’erreur précédente au déclenchement suivant', async () => {
    choisirPhoto.mockRejectedValueOnce(new Error('Not implemented')).mockResolvedValue(PHOTO)
    const { changePhoto, error } = actions()
    await changePhoto()

    await changePhoto()

    expect(error.value).toBeNull()
  })

  it('ne fait rien sans animal', async () => {
    const { changePhoto, removePhoto } = actions(null)

    expect(await changePhoto()).toBe(false)
    expect(await removePhoto()).toBe(false)
    expect(choisirPhoto).not.toHaveBeenCalled()
  })
})
