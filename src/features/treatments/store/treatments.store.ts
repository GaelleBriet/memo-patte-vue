import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  treatmentDosesService,
  type RecordedDose,
  type TreatmentDosesService,
} from '../service/treatment-doses.service'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from '../service/treatment-reminders.service'
import {
  treatmentStopService,
  type StoppedTreatment,
  type TreatmentStopService,
} from '../service/treatment-stop.service'
import type { Treatment, TreatmentEditInput, TreatmentInput } from '../schema/treatment.schema'
import type { TreatmentsRepository as FullTreatmentsRepository } from '../repository/treatments.repository'
import { track } from '@/core/analytics'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

// Le store ne dépend que de ce qu'il appelle : la cascade de suppression (#102) n'est pas son affaire.
type TreatmentsRepository = Pick<
  FullTreatmentsRepository,
  'getById' | 'listByAnimal' | 'create' | 'update' | 'remove'
>

export type TreatmentsRepositoryProvider = () =>
  TreatmentsRepository | Promise<TreatmentsRepository>

let provider: TreatmentsRepositoryProvider | null = null

export function provideTreatmentsRepository(next: TreatmentsRepositoryProvider | null): void {
  provider = next
}

type TreatmentReminders = Pick<TreatmentRemindersService, 'reschedule'>

let remindersProvider: () => TreatmentReminders = () => treatmentRemindersService

/** `null` rétablit le service réel. */
export function provideTreatmentRemindersService(next: (() => TreatmentReminders) | null): void {
  remindersProvider = next ?? (() => treatmentRemindersService)
}

type TreatmentDoses = Pick<TreatmentDosesService, 'record' | 'undo'>

let dosesProvider: () => TreatmentDoses = () => treatmentDosesService

/** `null` rétablit le service réel. */
export function provideTreatmentDosesService(next: (() => TreatmentDoses) | null): void {
  dosesProvider = next ?? (() => treatmentDosesService)
}

type TreatmentStop = Pick<TreatmentStopService, 'stop' | 'undo'>

let stopProvider: () => TreatmentStop = () => treatmentStopService

/** `null` rétablit le service réel. */
export function provideTreatmentStopService(next: (() => TreatmentStop) | null): void {
  stopProvider = next ?? (() => treatmentStopService)
}

export const useTreatmentsStore = defineStore('treatments', () => {
  /** Traitements de l'animal chargé, prochaine échéance croissante telle que rendue par le repository. */
  const treatments = ref<Treatment[]>([])
  /** Animal dont la liste est chargée, `null` tant qu'aucune n'a été demandée. */
  const animalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « aucun traitement ». */
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  function requireRepository(): Promise<TreatmentsRepository> {
    if (!provider) {
      throw new Error('Repository des traitements absent : appelle provideTreatmentsRepository().')
    }
    return Promise.resolve(provider())
  }

  async function refresh(repository: TreatmentsRepository, id: string): Promise<void> {
    const list = await repository.listByAnimal(id)
    // Un chargement lancé entre-temps pour un autre animal a priorité sur cette réponse.
    if (animalId.value !== id) return
    treatments.value = list
    hasLoaded.value = true
    error.value = null
  }

  // Une écriture ne relit que la liste déjà affichée : celle d'un autre animal reste à charger.
  async function write<T>(
    operation: (repository: TreatmentsRepository) => Promise<T>,
    touchedAnimalId: (result: T) => string | null,
  ): Promise<T> {
    isLoading.value = true
    try {
      const repository = await requireRepository()
      const result = await operation(repository)
      const touched = touchedAnimalId(result)
      if (touched !== null && touched === animalId.value) {
        await refresh(repository, touched)
      }
      return result
    } finally {
      isLoading.value = false
    }
  }

  return {
    treatments,
    animalId,
    isLoading,
    hasLoaded,
    error,

    /**
     * Ne lève pas : renvoie `false` et renseigne `error`. Renvoie aussi `true` quand la réponse
     * est ignorée parce qu'un autre animal a été demandé entre-temps.
     */
    async loadForAnimal(id: string): Promise<boolean> {
      isLoading.value = true
      animalId.value = id
      try {
        await refresh(await requireRepository(), id)
        return true
      } catch (cause) {
        if (animalId.value !== id) return false
        error.value = cause instanceof Error ? cause : new Error(String(cause))
        return false
      } finally {
        isLoading.value = false
      }
    },

    async getById(id: string): Promise<Treatment | null> {
      return (await requireRepository()).getById(id)
    },

    async create(input: TreatmentInput): Promise<Treatment> {
      const created = await write(
        async (repository) => {
          const treatment = await repository.create(input)
          await remindersProvider().reschedule(treatment.id)
          return treatment
        },
        (treatment) => treatment.animalId,
      )
      recordUsageSignal('entry')
      const species = useAnimalsStore().byId(created.animalId)?.species
      if (species) track('treatment_created', { species })
      return created
    },

    async update(id: string, input: TreatmentEditInput): Promise<Treatment> {
      return write(
        async (repository) => {
          const updated = await repository.update(id, input)
          await remindersProvider().reschedule(id)
          return updated
        },
        (updated) => updated.animalId,
      )
    },

    async remove(id: string): Promise<void> {
      await write(
        async (repository) => {
          await repository.remove(id)
          await remindersProvider().reschedule(id)
        },
        () => animalId.value,
      )
    },

    /** Prise du jour ou d'un jour passé ; `doseId` vaut `null` si ce jour était déjà noté. */
    async recordDose(treatmentId: string, givenOn: string): Promise<RecordedDose> {
      return write(
        () => dosesProvider().record(treatmentId, givenOn),
        (recorded) => recorded.animalId,
      )
    },

    async undoDose(treatmentId: string, doseId: string): Promise<void> {
      await write(
        () => dosesProvider().undo(treatmentId, doseId),
        () => animalId.value,
      )
    },

    async stop(treatmentId: string): Promise<StoppedTreatment> {
      return write(
        () => stopProvider().stop(treatmentId),
        (stopped) => stopped.animalId,
      )
    },

    async undoStop(treatmentId: string): Promise<void> {
      await write(
        () => stopProvider().undo(treatmentId),
        () => animalId.value,
      )
    },
  }
})
