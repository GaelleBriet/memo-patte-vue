import type { TreatmentDose } from './treatment-dose.schema'
import type { TreatmentPeriodRecord } from './treatment-period.schema'
import type { Treatment } from './treatment.schema'

/** Le traitement tel que sa table l'enregistre, sans sa période ni la tête de son historique. */
export type TreatmentRecord = Pick<
  Treatment,
  'id' | 'animalId' | 'name' | 'type' | 'createdAt' | 'updatedAt'
>

/**
 * Ce que le moteur d'échéances lit : toutes les périodes, de la première à la dernière, et les prises
 * visibles ; `createdByDevice` présent à la lecture de la base, absent des jeux de test.
 */
export type TreatmentWithPeriods = TreatmentRecord & {
  periods: TreatmentPeriodRecord[]
  doses: (TreatmentDose & { createdByDevice?: string })[]
}
