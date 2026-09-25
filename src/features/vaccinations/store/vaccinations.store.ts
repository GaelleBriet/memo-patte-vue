import { defineStore } from 'pinia'
import { ref } from 'vue'

import { isSameVaccineName } from '../logic/vaccination-name'
import {
  vaccinationInjectionsService,
  type InjectionInput,
  type RecordedInjection,
  type VaccinationInjectionsService,
} from '../service/vaccination-injections.service'
import {
  vaccinationRemindersService,
  type VaccinationRemindersService,
} from '../service/vaccination-reminders.service'
import type {
  Vaccination,
  VaccinationInput,
  VaccinationUpdateInput,
} from '../schema/vaccination.schema'
import type { VaccinationsRepository as FullVaccinationsRepository } from '../repository/vaccinations.repository'
import type { InjectionDates } from '../repository/vaccination-injections.repository'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import { track } from '@/core/analytics'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

// Le store ne dépend que de ce qu'il appelle : la cascade de suppression (#102) n'est pas son affaire.
type VaccinationsRepository = Pick<
  FullVaccinationsRepository,
  'getById' | 'listByAnimal' | 'create' | 'update' | 'remove' | 'listInjections'
>

export type VaccinationsRepositoryProvider = () =>
  VaccinationsRepository | Promise<VaccinationsRepository>

let provider: VaccinationsRepositoryProvider | null = null

export function provideVaccinationsRepository(next: VaccinationsRepositoryProvider | null): void {
  provider = next
}

type VaccinationReminders = Pick<VaccinationRemindersService, 'reschedule'>

let remindersProvider: () => VaccinationReminders = () => vaccinationRemindersService

/** `null` rétablit le service réel. */
export function provideVaccinationRemindersService(
  next: (() => VaccinationReminders) | null,
): void {
  remindersProvider = next ?? (() => vaccinationRemindersService)
}

type VaccinationInjections = Pick<
  VaccinationInjectionsService,
  'record' | 'undo' | 'remove' | 'undoRemove' | 'changeDate' | 'undoChangeDate'
>

let injectionsProvider: () => VaccinationInjections = () => vaccinationInjectionsService

/** `null` rétablit le service réel. */
export function provideVaccinationInjectionsService(
  next: (() => VaccinationInjections) | null,
): void {
  injectionsProvider = next ?? (() => vaccinationInjectionsService)
}

export const useVaccinationsStore = defineStore('vaccinations', () => {
  const vaccinations = ref<Vaccination[]>([])
  /** Animal dont la liste est chargée, `null` tant qu'aucune n'a été demandée. */
  const animalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Distingue « pas encore chargé » de « aucun vaccin ». */
  const hasLoaded = ref(false)
  /** Échec du dernier chargement : les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  function requireRepository(): Promise<VaccinationsRepository> {
    if (!provider) {
      throw new Error('Repository des vaccins absent : appelle provideVaccinationsRepository().')
    }
    return Promise.resolve(provider())
  }

  async function refresh(repository: VaccinationsRepository, id: string): Promise<void> {
    const list = await repository.listByAnimal(id)
    // Un chargement lancé entre-temps pour un autre animal a priorité sur cette réponse.
    if (animalId.value !== id) return
    vaccinations.value = list
    hasLoaded.value = true
    error.value = null
  }

  // Une écriture ne relit que la liste déjà affichée : celle d'un autre animal reste à charger.
  async function write<T>(
    operation: (repository: VaccinationsRepository) => Promise<T>,
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
    vaccinations,
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

    async getById(id: string): Promise<Vaccination | null> {
      return (await requireRepository()).getById(id)
    },

    /** Injections visibles, la tête d'abord ; la liste affichée ne change pas. */
    async listInjections(vaccinationId: string): Promise<VaccinationInjection[]> {
      return (await requireRepository()).listInjections(vaccinationId)
    },

    /** Le vaccin déjà suivi sous ce nom par l'animal, sans changer la liste affichée. */
    async findSameName(animalId: string, name: string): Promise<Vaccination | null> {
      const list = await (await requireRepository()).listByAnimal(animalId)
      return list.find((vaccination) => isSameVaccineName(vaccination.name, name)) ?? null
    },

    async create(input: VaccinationInput): Promise<Vaccination> {
      const created = await write(
        async (repository) => {
          const vaccination = await repository.create(input)
          await remindersProvider().reschedule(vaccination.id)
          return vaccination
        },
        (vaccination) => vaccination.animalId,
      )
      recordUsageSignal('entry')
      const species = useAnimalsStore().byId(created.animalId)?.species
      if (species) track('vaccination_created', { species })
      return created
    },

    async update(id: string, input: VaccinationUpdateInput): Promise<Vaccination> {
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

    async recordInjection(
      vaccinationId: string,
      input: InjectionInput,
    ): Promise<RecordedInjection> {
      return write(
        () => injectionsProvider().record(vaccinationId, input),
        (recorded) => recorded.animalId,
      )
    },

    async undoInjection(vaccinationId: string, injectionId: string): Promise<void> {
      await write(
        () => injectionsProvider().undo(vaccinationId, injectionId),
        () => animalId.value,
      )
    },

    async removeInjection(vaccinationId: string, injectionId: string): Promise<void> {
      await write(
        () => injectionsProvider().remove(vaccinationId, injectionId),
        () => animalId.value,
      )
    },

    async undoRemoveInjection(vaccinationId: string, injectionId: string): Promise<void> {
      await write(
        () => injectionsProvider().undoRemove(vaccinationId, injectionId),
        () => animalId.value,
      )
    },

    /** Renvoie les dates d'avant le changement, pour « Annuler ». */
    async changeInjectionDate(
      vaccinationId: string,
      injectionId: string,
      injectedOn: string,
    ): Promise<InjectionDates> {
      return write(
        () => injectionsProvider().changeDate(vaccinationId, injectionId, injectedOn),
        () => animalId.value,
      )
    },

    async undoChangeInjectionDate(
      vaccinationId: string,
      injectionId: string,
      previous: InjectionDates,
    ): Promise<void> {
      await write(
        () => injectionsProvider().undoChangeDate(vaccinationId, injectionId, previous),
        () => animalId.value,
      )
    },
  }
})
