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
 * `gridOriginOn` `null` : l'origine de la grille du réglage précédent (R3). `writtenOn` : le jour
 * de la correction, qui juge la date de grille d'une période ouverte ce jour-là (`inheritedGridDate`).
 */
export type TreatmentPlanWrite = {
  treatment: Pick<Treatment, 'name' | 'type'> | null
  period:
    | ({
        action: 'correct' | 'open'
        id: string
        settings: TreatmentPeriodSettings
        writtenOn?: string
      } & PeriodOrigin)
    | null
  doses: PlannedDoseWrite[]
}
