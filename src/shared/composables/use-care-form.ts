import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  leaveAfterReminderSaved,
  primingReturnRoute,
  type ReminderKind,
} from '../domain/notification-priming'
import { takesNewCare } from '../domain/unfollowed-animals'
import { returnTo } from '../utils/return-to'

export interface CareFormAnimal {
  id: string
  name: string
  unfollowedOn: string | null
}

export interface CareFormAnimals<A extends CareFormAnimal> {
  readonly animals: readonly A[]
  readonly hasLoaded: boolean
  load(): Promise<unknown>
  select(id: string): void
}

export interface CareFormOptions<T, A extends CareFormAnimal> {
  kind: ReminderKind
  animals: CareFormAnimals<A>
  /** Le soin modifié ou repris ; absent à la création. */
  id: () => string | undefined
  animalId: () => string | undefined
  /** L'animal du soin ouvert, qui prime sur celui de la route. */
  openedAnimalId: () => string | undefined
  /** Un animal qu'on ne suit plus ne reçoit aucun nouveau soin, sauf ici. */
  allowsUnfollowedAnimal: () => boolean
  load: (id: string) => Promise<T | null>
  open: (loaded: T) => void
}

/**
 * État commun des écrans de formulaire d'un soin (vaccin, traitement) : origine de la route,
 * chargement du soin, animal ciblé, échecs, enregistrement unique puis retour.
 */
export function useCareForm<T, A extends CareFormAnimal>(options: CareFormOptions<T, A>) {
  const router = useRouter()
  const { query } = useRoute()
  const { animals } = options

  const from = typeof query.from === 'string' ? query.from : undefined
  const reminder = typeof query.reminder === 'string' ? query.reminder : undefined

  const notFound = ref(false)
  const isLoading = ref(options.id() !== undefined)
  const loadFailed = ref(false)
  const saveFailed = ref(false)
  const isSubmitting = ref(false)
  const isSaved = ref(false)

  const targetAnimalId = computed(() => options.openedAnimalId() ?? options.animalId() ?? null)
  const targetAnimal = computed(
    () => animals.animals.find((animal) => animal.id === targetAnimalId.value) ?? null,
  )
  const animalName = computed(() => targetAnimal.value?.name ?? null)
  const canSave = computed(
    () =>
      !isSaved.value &&
      !isLoading.value &&
      !notFound.value &&
      !loadFailed.value &&
      (options.allowsUnfollowedAnimal() || takesNewCare(targetAnimal.value)),
  )

  watch(
    targetAnimal,
    (animal) => {
      if (!options.allowsUnfollowedAnimal() && animal !== null && !takesNewCare(animal)) {
        backToOrigin()
      }
    },
    { immediate: true },
  )

  function selectTargetAnimal(): void {
    if (targetAnimalId.value !== null) animals.select(targetAnimalId.value)
  }

  function backToOrigin(): void {
    selectTargetAnimal()
    returnTo(router, primingReturnRoute(from, reminder))
  }

  /** `write` rend `null` quand rien n'est à écrire ; après une écriture réussie, l'écran se quitte. */
  async function saveThenLeave(
    write: () => Promise<unknown> | null,
    hasDueDate: boolean,
  ): Promise<void> {
    isSubmitting.value = true
    saveFailed.value = false

    try {
      const pending = write()
      if (pending === null) return
      await pending
      isSaved.value = true
    } catch {
      saveFailed.value = true
      return
    } finally {
      isSubmitting.value = false
    }
    selectTargetAnimal()
    await leaveAfterReminderSaved(router, {
      hasDueDate,
      animalName: animalName.value,
      kind: options.kind,
      from,
      reminder,
    })
  }

  onMounted(async () => {
    const id = options.id()
    if (id !== undefined) {
      try {
        const loaded = await options.load(id)
        notFound.value = loaded === null
        if (loaded) options.open(loaded)
      } catch {
        loadFailed.value = true
      } finally {
        isLoading.value = false
      }
    }
    if (!animals.hasLoaded) await animals.load()
  })

  return {
    from,
    notFound,
    isLoading,
    loadFailed,
    saveFailed,
    isSubmitting,
    isSaved,
    targetAnimal,
    animalName,
    canSave,
    selectTargetAnimal,
    backToOrigin,
    saveThenLeave,
  }
}
