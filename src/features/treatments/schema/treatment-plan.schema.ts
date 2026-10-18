import type { DoseFields } from './treatment-dose.schema'
import type { PeriodOrigin, TreatmentPeriodSettings } from './treatment-period.schema'
import type { Treatment } from './treatment.schema'

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
 * `gridOriginOn` `null` : l'origine de la grille du réglage précédent (R3) ; `answered` : la période
 * répond à la question Q38, date la réponse et garde les échéances qu'elle a montrées (#873).
 */
export type TreatmentPlanWrite = {
  treatment: Pick<Treatment, 'name' | 'type'> | null
  period:
    | ({
        action: 'correct' | 'open'
        id: string
        settings: TreatmentPeriodSettings
      } & PeriodOrigin & {
          answered?: { listed: readonly string[] }
        })
    | null
  doses: PlannedDoseWrite[]
}
