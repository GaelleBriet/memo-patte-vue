import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { creationPlan } from '../logic/treatment-creation'
import { editionPlan } from '../logic/treatment-edition-plan'
import { resumptionPlan } from '../logic/treatment-resumption'
import {
  createWriteQueue,
  treatmentWriteQueue,
  type WriteQueue,
} from '../logic/treatment-write-queue'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
  type TreatmentWithPeriodsReader,
} from '../repository/treatments.repository'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import type {
  TreatmentCreationInput,
  TreatmentEditionInput,
  TreatmentResumptionInput,
} from '../schema/treatment-form.schema'
import type { Treatment } from '../schema/treatment.schema'
import {
  treatmentRemindersService,
  type TreatmentRemindersService,
} from './treatment-reminders.service'

type Provider<T> = () => T | Promise<T>

export type TreatmentPlanDependencies = {
  treatments: Provider<
    Pick<TreatmentsRepository, 'create' | 'applyPlan'> & TreatmentWithPeriodsReader
  >
  reminders: Pick<TreatmentRemindersService, 'reschedule'>
  today: () => string
  newId: () => string
  queue?: WriteQueue
}

/** Chaque méthode lève, sans rien écrire, pour une saisie refusée ou un traitement introuvable. */
export function createTreatmentPlanService({
  treatments,
  reminders,
  today,
  newId,
  queue = createWriteQueue(),
}: TreatmentPlanDependencies) {
  async function treatmentOf(id: string): Promise<TreatmentWithPeriods> {
    const treatment = await (await treatments()).getWithPeriods(id)
    if (treatment === null) throw new Error(`Traitement introuvable : ${id}`)
    return treatment
  }

  function ids() {
    return { periodId: newId(), newId }
  }

  return {
    /** Le traitement naît avec sa période et les seules prises renseignées dans l'encart (TR-3). */
    async create(input: TreatmentCreationInput): Promise<Treatment> {
      const treatment = await queue(async () =>
        (await treatments()).create(creationPlan(input, newId(), today(), newId)),
      )
      await reminders.reschedule(treatment.id)
      return treatment
    },

    /** Correction, nouvelle période ou déplacement de la prochaine dose, selon le carnet du jour. */
    async update(id: string, input: TreatmentEditionInput): Promise<Treatment> {
      const updated = await queue(async () => {
        const plan = editionPlan(await treatmentOf(id), input, today(), ids())
        return (await treatments()).applyPlan(id, plan)
      })
      await reminders.reschedule(id)
      return updated
    },

    /** Nouvelle période d'un traitement fini ou arrêté ; la précédente n'est jamais modifiée. */
    async resume(id: string, input: TreatmentResumptionInput): Promise<Treatment> {
      const resumed = await queue(async () => {
        const plan = resumptionPlan(await treatmentOf(id), input, today(), ids())
        return (await treatments()).applyPlan(id, plan)
      })
      await reminders.reschedule(id)
      return resumed
    },
  }
}

export type TreatmentPlanService = ReturnType<typeof createTreatmentPlanService>

export const treatmentPlanService = createTreatmentPlanService({
  treatments: getTreatmentsRepository,
  reminders: treatmentRemindersService,
  today: todayIsoDate,
  newId: () => crypto.randomUUID(),
  queue: treatmentWriteQueue,
})
