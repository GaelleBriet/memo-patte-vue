import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PhotoChange, PhotoRemoval } from '../service/animal-photo.service'
import type { Animal, AnimalInput } from '../schema/animal.schema'
import { useAnimalsStore } from '../store/animals.store'
import { pickPhoto } from '@/core/photos/photo-picker'
import { dismissToast, showUndoableToast } from '@/shared/utils/toast'

export type AnimalPhotoError = 'animals.form.errors.photo' | 'animals.form.errors.save'

function inputFrom(animal: Animal): AnimalInput {
  return {
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    birthDate: animal.birthDate,
    birthDateApproximate: animal.birthDateApproximate,
  }
}

/**
 * Change ou retire la photo d'un animal sans passer par son formulaire ; `true` si c'est enregistré.
 * Le retrait se défait par le toast, et le fichier n'est effacé qu'une fois le toast fermé sans « Annuler ».
 */
export function useAnimalPhotoActions(animal: Readonly<Ref<Animal | null>>) {
  const { t } = useI18n()
  const animals = useAnimalsStore()
  const isBusy = ref(false)
  const error = ref<AnimalPhotoError | null>(null)
  let isRemovalPending = false

  async function guarded(action: (target: Animal) => Promise<boolean>): Promise<boolean> {
    const target = animal.value
    if (!target || isBusy.value) return false

    isBusy.value = true
    error.value = null
    try {
      return await action(target)
    } finally {
      isBusy.value = false
    }
  }

  async function save(write: () => Promise<unknown>): Promise<boolean> {
    try {
      await write()
      return true
    } catch {
      error.value = 'animals.form.errors.save'
      return false
    }
  }

  function changePhoto(): Promise<boolean> {
    return guarded(async (target) => {
      let photo: PhotoChange | null
      try {
        const picked = await pickPhoto()
        photo = picked && { kind: 'replace', base64: picked.base64 }
      } catch {
        error.value = 'animals.form.errors.photo'
        return false
      }
      if (!photo) return false
      const saved = await save(() => animals.update(target.id, inputFrom(target), photo))
      if (saved && isRemovalPending) dismissToast()
      return saved
    })
  }

  function confirmRemoval(target: Animal, removal: PhotoRemoval): void {
    isRemovalPending = true
    showUndoableToast(t('animals.carnet.photo.removed'), {
      label: t('reminderSheet.undo'),
      ariaLabel: t('animals.carnet.photo.undoRemove', { name: target.name }),
      undo: () => {
        isRemovalPending = false
        return animals.undoRemovePhoto(inputFrom(animals.byId(target.id) ?? target), removal)
      },
      onUndone: () => {},
      onExpired: () => {
        isRemovalPending = false
        void animals.forgetRemovedPhoto(removal)
      },
      failedMessage: t('reminderSheet.undoFailed'),
    })
  }

  function removePhoto(): Promise<boolean> {
    return guarded((target) =>
      save(async () => {
        const removal = await animals.removePhoto(target.id, inputFrom(target))
        if (removal) confirmRemoval(target, removal)
      }),
    )
  }

  return { isBusy, error, changePhoto, removePhoto }
}
