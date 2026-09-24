import { injectionOn } from '../logic/vaccination-done'
import {
  getVaccinationInjectionsRepository,
  type VaccinationInjectionsRepository,
} from '../repository/vaccination-injections.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '../repository/vaccinations.repository'
import { vaccinationInputSchema } from '../schema/vaccination.schema'
import {
  vaccinationRemindersService,
  type VaccinationRemindersService,
} from './vaccination-reminders.service'

type Provider<T> = () => T | Promise<T>

export type VaccinationInjectionsDependencies = {
  vaccinations: Provider<Pick<VaccinationsRepository, 'getById'>>
  injections: Provider<Pick<VaccinationInjectionsRepository, 'record' | 'remove'>>
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

const injectionInputSchema = vaccinationInputSchema
  .pick({ lastInjectionDate: true, dueDate: true })
  .transform(({ lastInjectionDate, dueDate }) => ({
    injectedOn: lastInjectionDate,
    nextDueDate: dueDate,
  }))

export function createVaccinationInjectionsService({
  vaccinations,
  injections,
  reminders,
  now,
}: VaccinationInjectionsDependencies) {
  return {
    /** Lève pour une injection future ou un vaccin introuvable. */
    async record(vaccinationId: string, input: InjectionInput): Promise<RecordedInjection> {
      const data = injectionInputSchema.parse({
        lastInjectionDate: input.injectedOn,
        dueDate: input.nextDueDate,
      })
      const vaccination = await (await vaccinations()).getById(vaccinationId)
      if (vaccination === null) throw new Error(`Vaccin introuvable : ${vaccinationId}`)

      const injection = injectionOn(vaccination, data, {
        id: crypto.randomUUID(),
        at: now().toISOString(),
      })
      await (await injections()).record(injection)
      await reminders.reschedule(vaccinationId)
      return { animalId: vaccination.animalId, injectionId: injection.id }
    },

    async undo(vaccinationId: string, injectionId: string): Promise<void> {
      await (await injections()).remove(injectionId, now().toISOString())
      await reminders.reschedule(vaccinationId)
    },
  }
}

export type VaccinationInjectionsService = ReturnType<typeof createVaccinationInjectionsService>

export const vaccinationInjectionsService = createVaccinationInjectionsService({
  vaccinations: getVaccinationsRepository,
  injections: getVaccinationInjectionsRepository,
  reminders: vaccinationRemindersService,
  now: () => new Date(),
})
