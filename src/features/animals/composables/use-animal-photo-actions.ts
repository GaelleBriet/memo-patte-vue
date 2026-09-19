import { ref, type Ref } from 'vue'

import type { PhotoChange } from '../service/animal-photo.service'
import type { Animal, AnimalInput } from '../schema/animal.schema'
import { useAnimalsStore } from '../store/animals.store'
import { pickPhoto } from '@/core/photos/photo-picker'

export type AnimalPhotoError = 'animals.form.errors.photo' | 'animals.form.errors.save'

function inputFrom(animal: Animal): AnimalInput {
  return {
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    birthDate: animal.birthDate,
    initialWeightKg: animal.initialWeightKg,
  }
}

/** Change ou retire la photo d'un animal sans passer par son formulaire ; `true` si c'est enregistré. */
export function useAnimalPhotoActions(animal: Readonly<Ref<Animal | null>>) {
  const animals = useAnimalsStore()
  const isBusy = ref(false)
  const error = ref<AnimalPhotoError | null>(null)

  async function run(change: () => Promise<PhotoChange | null>): Promise<boolean> {
    const target = animal.value
    if (!target || isBusy.value) return false

    isBusy.value = true
    error.value = null
    try {
      let photo: PhotoChange | null
      try {
        photo = await change()
      } catch {
        error.value = 'animals.form.errors.photo'
        return false
      }
      if (!photo) return false

      try {
        await animals.update(target.id, inputFrom(target), photo)
        return true
      } catch {
        error.value = 'animals.form.errors.save'
        return false
      }
    } finally {
      isBusy.value = false
    }
  }

  return {
    isBusy,
    error,
    changePhoto: () =>
      run(async () => {
        const picked = await pickPhoto()
        return picked && { kind: 'replace', base64: picked.base64 }
      }),
    removePhoto: () => run(async () => ({ kind: 'remove' })),
  }
}
