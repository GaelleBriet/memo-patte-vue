import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { creationPlan, editionPlan, resumptionPlan } from '../logic/treatment-plan'
import {
  getTreatmentsRepository,
  type TreatmentWithHistory,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import type {
  TreatmentCreationInput,
  TreatmentEditionInput,
  TreatmentResumptionInput,
} from '../schema/treatment-form.schema'
import type { Treatment } from '../schema/treatment.schema'

type Provider<T> = () => T | Promise<T>

export type TreatmentPlanDependencies = {
  treatments: Provider<Pick<TreatmentsRepository, 'create' | 'applyPlan' | 'getWithHistory'>>
  today: () => string
  newId: () => string
}

/** Chaque méthode lève, sans rien écrire, pour une saisie refusée ou un traitement introuvable. */
export function createTreatmentPlanService({
  treatments,
  today,
  newId,
}: TreatmentPlanDependencies) {
  async function historyOf(id: string): Promise<TreatmentWithHistory> {
    const history = await (await treatments()).getWithHistory(id)
    if (history === null) throw new Error(`Traitement introuvable : ${id}`)
    return history
  }

  function ids() {
    return { periodId: newId(), doseId: newId() }
  }

  return {
    /** Le traitement naît avec sa période, sans prise (TR-3). */
    async create(input: TreatmentCreationInput): Promise<Treatment> {
      return (await treatments()).create(creationPlan(input, newId(), today()))
    },

    /** Correction, nouvelle période ou déplacement de la prochaine dose, selon le carnet du jour. */
    async update(id: string, input: TreatmentEditionInput): Promise<Treatment> {
      const plan = editionPlan(await historyOf(id), input, today(), ids())
      return (await treatments()).applyPlan(id, plan)
    },

    /** Nouvelle période d'un traitement fini ou arrêté ; la précédente n'est jamais modifiée. */
    async resume(id: string, input: TreatmentResumptionInput): Promise<Treatment> {
      const plan = resumptionPlan(await historyOf(id), input, today(), ids())
      return (await treatments()).applyPlan(id, plan)
    },
  }
}

export type TreatmentPlanService = ReturnType<typeof createTreatmentPlanService>

export const treatmentPlanService = createTreatmentPlanService({
  treatments: getTreatmentsRepository,
  today: todayIsoDate,
  newId: () => crypto.randomUUID(),
})
