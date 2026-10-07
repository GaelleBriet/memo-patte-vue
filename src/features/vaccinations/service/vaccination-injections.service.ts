import { z } from 'zod'

import { injectionOn } from '../logic/vaccination-done'
import {
  injectionDatesOn,
  keptPlannedDueDate,
  needsNewReminder,
  pastInjectionDue,
  pastInjectionNeedsReminder,
  VaccinationWithoutReminderError,
} from '../logic/vaccination-history'
import {
  getVaccinationInjectionsRepository,
  type InjectionDates,
  type VaccinationInjectionsRepository,
} from '../repository/vaccination-injections.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '../repository/vaccinations.repository'
import { dueDateSchema, injectionDateSchema, type Vaccination } from '../schema/vaccination.schema'
import {
  vaccinationRemindersService,
  type VaccinationRemindersService,
} from './vaccination-reminders.service'

type Provider<T> = () => T | Promise<T>

export type VaccinationInjectionsDependencies = {
  vaccinations: Provider<
    Pick<VaccinationsRepository, 'getById' | 'getPlannedDueDate' | 'plannedDueDateStatement'>
  >
  injections: Provider<
    Pick<
      VaccinationInjectionsRepository,
      'record' | 'remove' | 'getById' | 'revive' | 'changeDate' | 'listByVaccination'
    >
  >
  reminders: Pick<VaccinationRemindersService, 'reschedule'>
  now: () => Date
}

export type InjectionInput = {
  injectedOn: string
  /** Rappel choisi ce jour-là ; `null` pour « Pas de rappel ». */
  nextDueDate: string | null
}

export type RecordedInjection = {
  animalId: string
  injectionId: string
}

/** `plannedSet` : la seule injection supprimée a laissé son rappel au vaccin, redevenu prévu. */
export type RemovedInjection = { plannedSet: boolean }

const injectionInputSchema = z.object({
  injectedOn: injectionDateSchema,
  nextDueDate: dueDateSchema,
})

/** Rappel choisi avec la date de l'injection : une date valide, strictement après elle, ou aucune. */
const injectionWithReminderSchema = injectionInputSchema.refine(
  ({ injectedOn, nextDueDate }) => nextDueDate === null || nextDueDate > injectedOn,
  { path: ['nextDueDate'] },
)

export function createVaccinationInjectionsService({
  vaccinations,
  injections,
  reminders,
  now,
}: VaccinationInjectionsDependencies) {
  return {
    /** Lève pour une injection future ou un vaccin introuvable. */
    async record(vaccinationId: string, input: InjectionInput): Promise<RecordedInjection> {
      const data = injectionInputSchema.parse(input)
      const vaccination = await requireVaccination(vaccinationId)

      const injection = injectionOn(vaccination, data, {
        id: crypto.randomUUID(),
        at: now().toISOString(),
      })
      await (await injections()).record(injection)
      await reminders.reschedule(vaccinationId)
      return { animalId: vaccination.animalId, injectionId: injection.id }
    },

    /**
     * Lève pour une date future ou déjà prise par une injection du vaccin, ou qui dépasse le rappel
     * en cours : c'est `addPastWithReminder` qui l'ajoute alors.
     */
    async addPast(vaccinationId: string, injectedOn: string): Promise<RecordedInjection> {
      const date = injectionDateSchema.parse(injectedOn)
      const vaccination = await requireVaccination(vaccinationId)
      if (pastInjectionNeedsReminder(vaccination, date)) {
        throw new Error(`Prochain rappel à choisir : ${vaccinationId}`)
      }
      return recordPast(vaccination, {
        injectedOn: date,
        nextDueDate: pastInjectionDue(vaccination, date),
      })
    },

    /** Injection qui dépasse le rappel en cours, avec le rappel suivant choisi. */
    async addPastWithReminder(
      vaccinationId: string,
      dates: InjectionDates,
    ): Promise<RecordedInjection> {
      const data = injectionWithReminderSchema.parse(dates)
      const vaccination = await requireVaccination(vaccinationId)
      if (!pastInjectionNeedsReminder(vaccination, data.injectedOn)) {
        throw new Error(`Pas de rappel à choisir : ${vaccinationId}`)
      }
      return recordPast(vaccination, data)
    },

    /** Lève si le vaccin resterait sans injection ni rendez-vous prévu. */
    async undo(vaccinationId: string, injectionId: string): Promise<void> {
      const repository = await injections()
      const isOnly = (await repository.listByVaccination(vaccinationId)).length === 1
      const planned = await (await vaccinations()).getPlannedDueDate(vaccinationId)
      const removed =
        (!isOnly || planned !== null) && (await repository.remove(injectionId, now().toISOString()))
      if (!removed) throw new Error(`Injection non annulée : ${injectionId}`)
      await reminders.reschedule(vaccinationId)
    },

    /**
     * La seule injection laisse au vaccin son rendez-vous prévu, ou à défaut son propre rappel ;
     * sans l'un ni l'autre, lève `VaccinationWithoutReminderError`.
     */
    async remove(vaccinationId: string, injectionId: string): Promise<RemovedInjection> {
      const injection = await requireInjection(injectionId)
      const repository = await injections()
      const at = now().toISOString()
      const isOnly = (await repository.listByVaccination(vaccinationId)).length === 1
      const also = isOnly ? await keepReminderOf(vaccinationId, injection, at) : []

      if (!(await repository.remove(injectionId, at, also))) {
        throw new Error(`Injection non supprimée : ${injectionId}`)
      }
      await reminders.reschedule(vaccinationId)
      return { plannedSet: also.length > 0 }
    },

    async undoRemove(
      vaccinationId: string,
      injectionId: string,
      { plannedSet }: RemovedInjection,
    ): Promise<void> {
      const at = now().toISOString()
      const also = plannedSet
        ? [(await vaccinations()).plannedDueDateStatement(vaccinationId, null, at)]
        : []
      const revived = await (await injections()).revive(injectionId, at, also)
      if (!revived) throw new Error(`Injection non rétablie : ${injectionId}`)
      await reminders.reschedule(vaccinationId)
    },

    /**
     * Renvoie les dates d'avant, pour « Annuler ». Lève pour une date future, ou qui dépasse le
     * rappel « autre date » : c'est `changeDateAndReminder` qui déplace alors l'injection.
     */
    async changeDate(
      vaccinationId: string,
      injectionId: string,
      injectedOn: string,
    ): Promise<InjectionDates> {
      const date = injectionDateSchema.parse(injectedOn)
      const injection = await requireInjection(injectionId)
      if (needsNewReminder(injection, date)) {
        throw new Error(`Prochain rappel à choisir : ${injectionId}`)
      }

      await writeDates(vaccinationId, injectionId, injectionDatesOn(injection, date))
      return { injectedOn: injection.injectedOn, nextDueDate: injection.nextDueDate }
    },

    /** Date et rappel choisis ensemble, écrits d'un coup ; renvoie les dates d'avant. */
    async changeDateAndReminder(
      vaccinationId: string,
      injectionId: string,
      dates: InjectionDates,
    ): Promise<InjectionDates> {
      const data = injectionWithReminderSchema.parse(dates)
      const injection = await requireInjection(injectionId)

      await writeDates(vaccinationId, injectionId, data)
      return { injectedOn: injection.injectedOn, nextDueDate: injection.nextDueDate }
    },

    undoChangeDate(
      vaccinationId: string,
      injectionId: string,
      previous: InjectionDates,
    ): Promise<void> {
      return writeDates(vaccinationId, injectionId, previous)
    },
  }

  /** Sans rendez-vous prévu, le vaccin prend le rappel de sa seule injection supprimée. */
  async function keepReminderOf(vaccinationId: string, injection: InjectionDates, at: string) {
    const repository = await vaccinations()
    const planned = await repository.getPlannedDueDate(vaccinationId)
    const kept = keptPlannedDueDate(planned, injection)
    if (kept === null) throw new VaccinationWithoutReminderError(vaccinationId)
    return planned === null ? [repository.plannedDueDateStatement(vaccinationId, kept, at)] : []
  }

  async function recordPast(
    vaccination: Vaccination,
    dates: InjectionDates,
  ): Promise<RecordedInjection> {
    const repository = await injections()
    const taken = (await repository.listByVaccination(vaccination.id)).map(
      (injection) => injection.injectedOn,
    )
    if (taken.includes(dates.injectedOn)) {
      throw new Error(`Injection déjà notée ce jour : ${dates.injectedOn}`)
    }

    const injection = injectionOn(vaccination, dates, {
      id: crypto.randomUUID(),
      at: now().toISOString(),
    })
    await repository.record(injection)
    await reminders.reschedule(vaccination.id)
    return { animalId: vaccination.animalId, injectionId: injection.id }
  }

  async function requireVaccination(vaccinationId: string) {
    const vaccination = await (await vaccinations()).getById(vaccinationId)
    if (vaccination === null) throw new Error(`Vaccin introuvable : ${vaccinationId}`)
    return vaccination
  }

  async function requireInjection(injectionId: string) {
    const injection = await (await injections()).getById(injectionId)
    if (injection === null) throw new Error(`Injection introuvable : ${injectionId}`)
    return injection
  }

  async function writeDates(
    vaccinationId: string,
    injectionId: string,
    dates: InjectionDates,
  ): Promise<void> {
    const changed = await (await injections()).changeDate(injectionId, dates, now().toISOString())
    if (!changed) throw new Error(`Injection non modifiée : ${injectionId}`)
    await reminders.reschedule(vaccinationId)
  }
}

export type VaccinationInjectionsService = ReturnType<typeof createVaccinationInjectionsService>

export const vaccinationInjectionsService = createVaccinationInjectionsService({
  vaccinations: getVaccinationsRepository,
  injections: getVaccinationInjectionsRepository,
  reminders: vaccinationRemindersService,
  now: () => new Date(),
})
