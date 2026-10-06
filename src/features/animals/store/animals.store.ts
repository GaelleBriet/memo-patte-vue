import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Animal, AnimalCreationInput, AnimalInput, Departure } from '../schema/animal.schema'
import {
  animalCreationService,
  type AnimalCreationService,
} from '../service/animal-creation.service'
import {
  animalDeletionService,
  type AnimalDeletionService,
  type AnimalRemoval,
} from '../service/animal-deletion.service'
import {
  animalFollowService,
  type AnimalFollowService,
  type FollowUndo,
  type UnfollowUndo,
} from '../service/animal-follow.service'
import { animalPhotoService, type PhotoChange } from '../service/animal-photo.service'
import type { AnimalsRepository } from '../repository/animals.repository'
import { track } from '@/core/analytics'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

export type AnimalsRepositoryProvider = () => AnimalsRepository | Promise<AnimalsRepository>
export type AnimalDeletionServiceProvider = () => AnimalDeletionService
export type AnimalCreationServiceProvider = () => Pick<AnimalCreationService, 'create'>
export type AnimalFollowServiceProvider = () => AnimalFollowService

const KEEP_PHOTO: PhotoChange = { kind: 'keep' }

let provider: AnimalsRepositoryProvider | null = null
let deletionProvider: AnimalDeletionServiceProvider = () => animalDeletionService
let creationProvider: AnimalCreationServiceProvider = () => animalCreationService
let followProvider: AnimalFollowServiceProvider = () => animalFollowService

export function provideAnimalsRepository(next: AnimalsRepositoryProvider | null): void {
  provider = next
}

/** `null` rétablit le service réel, branché sur la base locale. */
export function provideAnimalDeletionService(next: AnimalDeletionServiceProvider | null): void {
  deletionProvider = next ?? (() => animalDeletionService)
}

/** `null` rétablit le service réel, branché sur la base locale. */
export function provideAnimalCreationService(next: AnimalCreationServiceProvider | null): void {
  creationProvider = next ?? (() => animalCreationService)
}

/** `null` rétablit le service réel, branché sur la base locale. */
export function provideAnimalFollowService(next: AnimalFollowServiceProvider | null): void {
  followProvider = next ?? (() => animalFollowService)
}

export const useAnimalsStore = defineStore('animals', () => {
  const animals = ref<Animal[]>([])
  /** `null` signifie « tous les animaux ». */
  const selectedAnimalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « aucun animal ». */
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  const followedAnimals = computed(() =>
    animals.value.filter((animal) => animal.unfollowedOn === null),
  )
  const unfollowedAnimals = computed(() =>
    animals.value.filter((animal) => animal.unfollowedOn !== null),
  )

  const selectedAnimal = computed(
    () => animals.value.find((animal) => animal.id === selectedAnimalId.value) ?? null,
  )

  function requireRepository(): Promise<AnimalsRepository> {
    if (!provider) {
      throw new Error('Repository des animaux absent : appelle provideAnimalsRepository().')
    }
    return Promise.resolve(provider())
  }

  // Relire la liste est le seul moment où l'état affiché redevient sain.
  async function refresh(repository: AnimalsRepository): Promise<void> {
    animals.value = await repository.list()
    hasLoaded.value = true
    forgetSelectionIfGone()
    error.value = null
  }

  async function write<T>(operation: (repository: AnimalsRepository) => Promise<T>): Promise<T> {
    isLoading.value = true
    try {
      const repository = await requireRepository()
      const result = await operation(repository)
      await refresh(repository)
      return result
    } finally {
      isLoading.value = false
    }
  }

  function forgetSelectionIfGone(): void {
    if (selectedAnimal.value === null) {
      selectedAnimalId.value = null
    }
  }

  return {
    /** Suivis ou non, dans l'ordre de création. */
    animals,
    followedAnimals,
    unfollowedAnimals,
    selectedAnimalId,
    selectedAnimal,
    isLoading,
    hasLoaded,
    error,

    /** Ne lève pas : renvoie `false` et renseigne `error`. */
    async load(): Promise<boolean> {
      isLoading.value = true
      try {
        await refresh(await requireRepository())
        return true
      } catch (cause) {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
        return false
      } finally {
        isLoading.value = false
      }
    },

    async create(input: AnimalCreationInput, photo: PhotoChange = KEEP_PHOTO): Promise<Animal> {
      const animal = await write(() => animalPhotoService.create(creationProvider(), input, photo))
      if (photo.kind === 'replace') recordUsageSignal('photo')
      track('animal_created', { species: animal.species })
      return animal
    },

    /** Sans `photo`, la photo en place est gardée quel que soit `input.photoPath`. */
    async update(id: string, input: AnimalInput, photo: PhotoChange = KEEP_PHOTO): Promise<Animal> {
      const animal = await write((repository) =>
        animalPhotoService.update(repository, id, input, photo),
      )
      if (photo.kind === 'replace') recordUsageSignal('photo')
      return animal
    },

    /** Rend ce qu'il faut passer à `undoRemove` ou `forgetPhoto` ; `null` si rien n'a été supprimé. */
    remove(id: string): Promise<AnimalRemoval | null> {
      return write(() => deletionProvider().remove(id))
    },

    async undoRemove(removal: AnimalRemoval): Promise<void> {
      await write(() => deletionProvider().restore(removal))
    },

    forgetPhoto(removal: AnimalRemoval): Promise<void> {
      return deletionProvider().forgetPhoto(removal)
    },

    /** Rend ce qu'il faut passer à `undoUnfollow` ; `null` s'il n'était déjà plus suivi. */
    unfollow(id: string): Promise<UnfollowUndo | null> {
      return write(() => followProvider().unfollow(id))
    },

    async undoUnfollow(undo: UnfollowUndo): Promise<void> {
      await write(() => followProvider().undoUnfollow(undo))
    },

    /** Rend ce qu'il faut passer à `undoFollow` ; `null` s'il était déjà suivi. */
    follow(id: string): Promise<FollowUndo | null> {
      return write(() => followProvider().follow(id))
    },

    async undoFollow(undo: FollowUndo): Promise<void> {
      await write(() => followProvider().undoFollow(undo))
    },

    /** AN-10 : motif et date du départ d'un animal qu'on ne suit plus. */
    async saveDeparture(id: string, details: Omit<Departure, 'unfollowedOn'>): Promise<void> {
      await write((repository) => repository.setDepartureDetails(id, details))
    },

    select(id: string | null): void {
      selectedAnimalId.value = id
    },

    byId(id: string): Animal | null {
      return animals.value.find((animal) => animal.id === id) ?? null
    },
  }
})
