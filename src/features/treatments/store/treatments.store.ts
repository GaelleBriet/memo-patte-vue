import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  treatmentDosesService,
  type AppliedDoseChange,
  type TreatmentDosesService,
} from '../service/treatment-doses.service'
import { treatmentPlanService, type TreatmentPlanService } from '../service/treatment-plan.service'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from '../service/treatment-reminders.service'
import {
  treatmentStopService,
  type StoppedTreatment,
  type TreatmentStopService,
} from '../service/treatment-stop.service'
import type {
  TreatmentCreationInput,
  TreatmentEditionInput,
  TreatmentResumptionInput,
} from '../schema/treatment-form.schema'
import type { Treatment } from '../schema/treatment.schema'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { DoseWrite } from '../repository/treatment-doses.repository'
import type { DoseAction } from '../logic/treatment-dose-writes'
import type { TreatmentsRepository as FullTreatmentsRepository } from '../repository/treatments.repository'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { track } from '@/core/analytics'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import type { DoseGesture } from '@/shared/domain/treatment-schedule'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

type TreatmentsRepository = Pick<
  FullTreatmentsRepository,
  'getById' | 'remove' | 'restore' | 'listDoses' | 'getWithHistory' | 'listWithHistoryByAnimal'
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

type TreatmentDoses = Pick<TreatmentDosesService, 'apply' | 'undoBatch'>

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

type TreatmentPlan = Pick<TreatmentPlanService, 'create' | 'update' | 'resume'>

let planProvider: () => TreatmentPlan = () => treatmentPlanService

/** `null` rétablit le service réel. */
export function provideTreatmentPlanService(next: (() => TreatmentPlan) | null): void {
  planProvider = next ?? (() => treatmentPlanService)
}

export const useTreatmentsStore = defineStore('treatments', () => {
  /** Traitements de l'animal chargé, avec leurs périodes et leurs prises, dans l'ordre de saisie. */
  const treatments = ref<TreatmentWithHistory[]>([])
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
    const list = await repository.listWithHistoryByAnimal(id)
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

    /** Le traitement, toutes ses périodes et ses prises : l'entrée de `treatmentScheduleOf`. */
    async getWithHistory(id: string): Promise<TreatmentWithHistory | null> {
      return (await requireRepository()).getWithHistory(id)
    },

    async listWithHistoryByAnimal(id: string): Promise<TreatmentWithHistory[]> {
      return (await requireRepository()).listWithHistoryByAnimal(id)
    },

    /** Prises visibles, la tête d'abord ; la liste affichée ne change pas. */
    async listDoses(treatmentId: string): Promise<TreatmentDose[]> {
      return (await requireRepository()).listDoses(treatmentId)
    },

    async create(input: TreatmentCreationInput): Promise<Treatment> {
      const created = await write(
        () => planProvider().create(input),
        (treatment) => treatment.animalId,
      )
      recordUsageSignal('entry')
      recordUsageSignal('care')
      const species = useAnimalsStore().byId(created.animalId)?.species
      if (species) track('treatment_created', { species })
      return created
    },

    async update(id: string, input: TreatmentEditionInput): Promise<Treatment> {
      return write(
        () => planProvider().update(id, input),
        (updated) => updated.animalId,
      )
    },

    /** Le traitement fini ou arrêté repart dans une nouvelle période, à la première prise choisie. */
    async resume(id: string, input: TreatmentResumptionInput): Promise<Treatment> {
      const resumed = await write(
        () => planProvider().resume(id, input),
        (treatment) => treatment.animalId,
      )
      recordUsageSignal('care')
      return resumed
    },

    /** Rend l'instant de la suppression, à passer à `undoRemove`. */
    async remove(id: string): Promise<string> {
      return write(
        async (repository) => {
          const deletedAt = await repository.remove(id)
          await remindersProvider().reschedule(id)
          return deletedAt
        },
        () => animalId.value,
      )
    },

    async undoRemove(id: string, deletedAt: string): Promise<void> {
      await write(
        async (repository) => {
          await repository.restore(id, deletedAt)
          await remindersProvider().reschedule(id)
        },
        () => animalId.value,
      )
    },

    /** `gestures` : doses renseignées avec l'arrêt, dans le même geste. */
    async stop(
      treatmentId: string,
      gestures: readonly DoseGesture[] = [],
    ): Promise<StoppedTreatment> {
      return write(
        () => stopProvider().stop(treatmentId, gestures),
        (stopped) => stopped.animalId,
      )
    },

    /** `writes` : le lot `undo` rendu par `stop`. */
    async undoStop(treatmentId: string, writes: readonly DoseWrite[] = []): Promise<void> {
      await write(
        () => stopProvider().undo(treatmentId, writes),
        () => animalId.value,
      )
    },

    /** Geste de la fiche sur une prise ou un report ; `undo` se passe à `undoDoseAction`. */
    async applyDoseAction(treatmentId: string, action: DoseAction): Promise<AppliedDoseChange> {
      return write(
        () => dosesProvider().apply(treatmentId, action),
        (applied) => applied.animalId,
      )
    },

    async undoDoseAction(treatmentId: string, writes: readonly DoseWrite[]): Promise<void> {
      await write(
        () => dosesProvider().undoBatch(treatmentId, writes),
        () => animalId.value,
      )
    },
  }
})
