import type { TreatmentPeriodSettings } from './treatment-period.schema'
import type { Treatment } from './treatment.schema'
import type { DoseFields } from '@/shared/domain/treatment-schedule'

/** Un traitement à créer avec sa première période, et les prises renseignées à la création (TR-3). */
export type NewTreatmentPlan = Pick<Treatment, 'id' | 'animalId' | 'name' | 'type'> & {
  settings: TreatmentPeriodSettings
  doses?: { id: string; dose: DoseFields }[]
}

export type PlannedDoseWrite =
  | { action: 'create'; id: string; dose: DoseFields }
  | { action: 'rewrite'; id: string; dose: DoseFields }
  | { action: 'delete'; id: string }

/**
 * Ce que « Modifier » ou « Reprendre » écrit en une fois ; `null` : rien à écrire dans cette table.
 * `referenceOn` absent : le jour de référence suit la première échéance.
 */
export type TreatmentPlanWrite = {
  treatment: Pick<Treatment, 'name' | 'type'> | null
  period:
    | { action: 'correct'; settings: TreatmentPeriodSettings; referenceOn?: string }
    | { action: 'open'; id: string; settings: TreatmentPeriodSettings; referenceOn?: string }
    | null
  doses: PlannedDoseWrite[]
}
