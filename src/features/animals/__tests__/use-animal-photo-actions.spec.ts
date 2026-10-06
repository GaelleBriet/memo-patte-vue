import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { defineComponent, ref } from 'vue'

import type { Animal, AnimalInput } from '../schema/animal.schema'
import type { PhotoChange, PhotoRemoval } from '../service/animal-photo.service'
import { useAnimalsStore } from '../store/animals.store'
import { useAnimalPhotoActions } from '../composables/use-animal-photo-actions'
import i18n from '@/core/i18n'
import { pickPhoto, type PickedPhoto } from '@/core/photos/photo-picker'
import {
  dismissToast,
  runToastAction,
  showToast,
  toastAction,
  toastMessage,
} from '@/shared/utils/toast'

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
  birthDateApproximate: false,
  photoPath: 'milo.jpg',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

const PHOTO: PickedPhoto = { base64: 'TUlMTw==', previewUrl: 'data:image/jpeg;base64,TUlMTw==' }

const RETRAIT: PhotoRemoval = { animalId: MILO.id, photoPath: 'milo.jpg' }

let update: MockInstance<(id: string, input: AnimalInput, photo?: PhotoChange) => Promise<Animal>>
let removePhoto: MockInstance<(id: string, input: AnimalInput) => Promise<PhotoRemoval | null>>
let undoRemovePhoto: MockInstance<(input: AnimalInput, removal: PhotoRemoval) => Promise<void>>
let forgetRemovedPhoto: MockInstance<(removal: PhotoRemoval) => Promise<void>>

beforeEach(() => {
  choisirPhoto.mockReset()
  setActivePinia(createPinia())
  const store = useAnimalsStore()
  update = vi.spyOn(store, 'update').mockResolvedValue(MILO)
  removePhoto = vi.spyOn(store, 'removePhoto').mockResolvedValue(RETRAIT)
  undoRemovePhoto = vi.spyOn(store, 'undoRemovePhoto').mockResolvedValue()
  forgetRemovedPhoto = vi.spyOn(store, 'forgetRemovedPhoto').mockResolvedValue()
})

afterEach(() => {
  dismissToast()
})

function actions(animal: Animal | null = MILO) {
  let result: ReturnType<typeof useAnimalPhotoActions> | undefined
  mount(
    defineComponent({
      setup() {
        result = useAnimalPhotoActions(ref(animal))
        return () => null
      },
    }),
    { global: { plugins: [i18n] } },
  )
  return result!
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
        birthDateApproximate: false,
      },
      { kind: 'replace', base64: 'TUlMTw==' },
    )
  })

  it('garde la date approximative en changeant ou en retirant la photo', async () => {
    choisirPhoto.mockResolvedValue(PHOTO)
    const { changePhoto, removePhoto: retirer } = actions({ ...MILO, birthDateApproximate: true })

    await changePhoto()
    await retirer()
    runToastAction()
    await flushPromises()

    const inputs = [
      update.mock.calls[0]![1],
      removePhoto.mock.calls[0]![1],
      undoRemovePhoto.mock.calls[0]![0],
    ]
    for (const input of inputs) {
      expect(input).toMatchObject({ birthDate: '2023-03-12', birthDateApproximate: true })
    }
  })

  it('n’enregistre rien quand le sélecteur est fermé sans choix', async () => {
    choisirPhoto.mockResolvedValue(null)
    const { changePhoto, error } = actions()

    expect(await changePhoto()).toBe(false)

    expect(update).not.toHaveBeenCalled()
    expect(error.value).toBeNull()
  })

  it('retire la photo en gardant la fiche telle quelle, avec « Photo retirée » · « Annuler »', async () => {
    const { removePhoto: retirer } = actions()

    expect(await retirer()).toBe(true)

    expect(removePhoto).toHaveBeenCalledExactlyOnceWith(MILO.id, {
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2023-03-12',
      birthDateApproximate: false,
    })
    expect(toastMessage.value).toBe('Photo retirée')
    expect(toastAction.value?.label).toBe('Annuler')
    expect(toastAction.value?.ariaLabel).toBe('Annuler le retrait de la photo de Milo')
  })

  it('« Annuler » rend la même photo, sans effacer son fichier', async () => {
    const { removePhoto: retirer } = actions()
    await retirer()

    runToastAction()
    await flushPromises()

    expect(undoRemovePhoto).toHaveBeenCalledExactlyOnceWith(
      {
        name: 'Milo',
        species: 'dog',
        breed: 'Labrador',
        birthDate: '2023-03-12',
        birthDateApproximate: false,
      },
      RETRAIT,
    )
    expect(forgetRemovedPhoto).not.toHaveBeenCalled()
  })

  it('n’efface le fichier qu’une fois le toast fermé sans « Annuler »', async () => {
    const { removePhoto: retirer } = actions()
    await retirer()
    expect(forgetRemovedPhoto).not.toHaveBeenCalled()

    dismissToast()

    expect(forgetRemovedPhoto).toHaveBeenCalledExactlyOnceWith(RETRAIT)
  })

  it('une photo choisie pendant le toast le ferme et rend le retrait définitif', async () => {
    choisirPhoto.mockResolvedValue(PHOTO)
    const { removePhoto: retirer, changePhoto } = actions()
    await retirer()

    expect(await changePhoto()).toBe(true)

    expect(toastMessage.value).toBeNull()
    expect(forgetRemovedPhoto).toHaveBeenCalledExactlyOnceWith(RETRAIT)
    expect(undoRemovePhoto).not.toHaveBeenCalled()
  })

  it('une photo choisie après le toast ne ferme pas un autre toast', async () => {
    choisirPhoto.mockResolvedValue(PHOTO)
    const { removePhoto: retirer, changePhoto } = actions()
    await retirer()
    dismissToast()
    showToast('Pesée enregistrée')

    await changePhoto()

    expect(toastMessage.value).toBe('Pesée enregistrée')
    expect(forgetRemovedPhoto).toHaveBeenCalledOnce()
  })

  it('n’affiche rien quand il n’y avait pas de photo à retirer', async () => {
    removePhoto.mockResolvedValue(null)
    const { removePhoto: retirer } = actions()

    expect(await retirer()).toBe(true)

    expect(toastMessage.value).toBeNull()
  })

  it('ignore un second déclenchement tant que le premier n’est pas fini', async () => {
    let terminer: (photo: PickedPhoto | null) => void = () => {}
    choisirPhoto.mockReturnValue(new Promise((resolve) => (terminer = resolve)))
    const { changePhoto, removePhoto: retirer, isBusy } = actions()

    const premier = changePhoto()
    expect(isBusy.value).toBe(true)
    expect(await changePhoto()).toBe(false)
    expect(await retirer()).toBe(false)

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
    choisirPhoto.mockResolvedValue(PHOTO)
    const { changePhoto, error } = actions()

    expect(await changePhoto()).toBe(false)

    expect(error.value).toBe('animals.form.errors.save')
  })

  it('signale un retrait en échec, sans toast', async () => {
    removePhoto.mockRejectedValue(new Error('base verrouillée'))
    const { removePhoto: retirer, error } = actions()

    expect(await retirer()).toBe(false)

    expect(error.value).toBe('animals.form.errors.save')
    expect(toastMessage.value).toBeNull()
  })

  it('efface l’erreur précédente au déclenchement suivant', async () => {
    choisirPhoto.mockRejectedValueOnce(new Error('Not implemented')).mockResolvedValue(PHOTO)
    const { changePhoto, error } = actions()
    await changePhoto()

    await changePhoto()

    expect(error.value).toBeNull()
  })

  it('ne fait rien sans animal', async () => {
    const { changePhoto, removePhoto: retirer } = actions(null)

    expect(await changePhoto()).toBe(false)
    expect(await retirer()).toBe(false)
    expect(choisirPhoto).not.toHaveBeenCalled()
  })
})
