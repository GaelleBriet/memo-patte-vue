import type { NewTreatmentDose } from './treatment-dose.schema'
import type { TreatmentPeriodRecord } from './treatment-period.schema'
import type { Treatment } from './treatment.schema'

/** Le traitement tel que sa table l'enregistre, sans sa période ni la tête de son historique. */
export type TreatmentRecord = Pick<
  Treatment,
  'id' | 'animalId' | 'name' | 'type' | 'createdAt' | 'updatedAt'
>

/**
 * Ce que le moteur d'échéances lit : toutes les périodes, de la première à la dernière, et les prises
 * visibles ; `createdByDevice` quand le traitement est lu pour un geste (TR-25).
 */
export type TreatmentWithHistory = TreatmentRecord & {
  periods: TreatmentPeriodRecord[]
  doses: (NewTreatmentDose & { createdByDevice?: string })[]
}
