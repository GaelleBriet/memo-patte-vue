import { defineStore } from 'pinia'

import { isSameVaccineName } from '../logic/vaccination-name'
import {
  vaccinationInjectionsService,
  type InjectionInput,
  type RecordedInjection,
  type RemovedInjection,
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
import { useAnimalScopedList } from '@/shared/composables/use-animal-scoped-list'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

// Le store ne dépend que de ce qu'il appelle : la cascade de suppression (#102) n'est pas son affaire.
type VaccinationsRepository = Pick<
  FullVaccinationsRepository,
  | 'getById'
  | 'listByAnimal'
  | 'listAll'
  | 'create'
  | 'update'
  | 'remove'
  | 'restore'
  | 'listInjections'
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
  | 'record'
  | 'addPast'
  | 'addPastWithReminder'
  | 'undo'
  | 'remove'
  | 'undoRemove'
  | 'changeDate'
  | 'changeDateAndReminder'
  | 'undoChangeDate'
>

let injectionsProvider: () => VaccinationInjections = () => vaccinationInjectionsService

/** `null` rétablit le service réel. */
export function provideVaccinationInjectionsService(
  next: (() => VaccinationInjections) | null,
): void {
  injectionsProvider = next ?? (() => vaccinationInjectionsService)
}

export const useVaccinationsStore = defineStore('vaccinations', () => {
  function requireRepository(): Promise<VaccinationsRepository> {
    if (!provider) {
      throw new Error('Repository des vaccins absent : appelle provideVaccinationsRepository().')
    }
    return Promise.resolve(provider())
  }

  const {
    items: vaccinations,
    animalId,
    isLoading,
    hasLoaded,
    error,
    loadForAnimal,
    write,
  } = useAnimalScopedList(requireRepository, (repository, id) => repository.listByAnimal(id))

  return {
    vaccinations,
    animalId,
    isLoading,
    hasLoaded,
    error,
    loadForAnimal,

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

    /** Vaccins de tous les animaux, sans changer la liste affichée. */
    async listAll(): Promise<Vaccination[]> {
      return (await requireRepository()).listAll()
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
      recordUsageSignal('care')
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

    async recordInjection(
      vaccinationId: string,
      input: InjectionInput,
    ): Promise<RecordedInjection> {
      return write(
        () => injectionsProvider().record(vaccinationId, input),
        (recorded) => recorded.animalId,
      )
    },

    async addPastInjection(vaccinationId: string, injectedOn: string): Promise<RecordedInjection> {
      return write(
        () => injectionsProvider().addPast(vaccinationId, injectedOn),
        (recorded) => recorded.animalId,
      )
    },

    async addPastInjectionWithReminder(
      vaccinationId: string,
      dates: InjectionDates,
    ): Promise<RecordedInjection> {
      return write(
        () => injectionsProvider().addPastWithReminder(vaccinationId, dates),
        (recorded) => recorded.animalId,
      )
    },

    async undoInjection(vaccinationId: string, injectionId: string): Promise<void> {
      await write(
        () => injectionsProvider().undo(vaccinationId, injectionId),
        () => animalId.value,
      )
    },

    /** Rend de quoi annuler la suppression, à passer à `undoRemoveInjection`. */
    async removeInjection(vaccinationId: string, injectionId: string): Promise<RemovedInjection> {
      return write(
        () => injectionsProvider().remove(vaccinationId, injectionId),
        () => animalId.value,
      )
    },

    async undoRemoveInjection(
      vaccinationId: string,
      injectionId: string,
      removed: RemovedInjection,
    ): Promise<void> {
      await write(
        () => injectionsProvider().undoRemove(vaccinationId, injectionId, removed),
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

    /** Date et rappel choisis ensemble ; renvoie les dates d'avant, pour « Annuler ». */
    async changeInjectionDateAndReminder(
      vaccinationId: string,
      injectionId: string,
      dates: InjectionDates,
    ): Promise<InjectionDates> {
      return write(
        () => injectionsProvider().changeDateAndReminder(vaccinationId, injectionId, dates),
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
