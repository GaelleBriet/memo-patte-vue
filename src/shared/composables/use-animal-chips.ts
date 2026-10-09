import { computed } from 'vue'

import { usePhotoUrls } from '@/core/photos/use-photo-urls'
import type { AnimalChipItem } from '@/shared/components/AnimalChipSelector.vue'

type ChipAnimal = { id: string; name: string; photoPath: string | null }

/** Puces d'un sélecteur d'animaux, dans l'ordre reçu, photo résolue dès qu'elle est prête. */
export function useAnimalChips(animals: () => readonly ChipAnimal[]) {
  const photoUrl = usePhotoUrls(() => animals().map((animal) => animal.photoPath))

  return computed<AnimalChipItem[]>(() =>
    animals().map((animal) => ({
      id: animal.id,
      name: animal.name,
      photoUrl: photoUrl(animal.photoPath),
    })),
  )
}
