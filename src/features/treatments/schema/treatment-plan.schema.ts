import type { DoseFields } from './treatment-dose.schema'
import type { PeriodOrigin, TreatmentPeriodSettings } from './treatment-period.schema'
import type { Treatment } from './treatment.schema'
import type { GridBefore } from '@/shared/domain/dose-calendar'

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
 * `gridOriginOn` `null` : l'origine de la grille du réglage précédent (R3). `judgedGridAt` : la
 * date de grille jugée par le moteur (`judgedGrid`), à poser telle quelle.
 */
export type TreatmentPlanWrite = {
  treatment: Pick<Treatment, 'name' | 'type'> | null
  period:
    | ({
        action: 'correct' | 'open'
        id: string
        settings: TreatmentPeriodSettings
        judgedGridAt?: string
        /** À l'ouverture : la grille d'avant, que garde la période. */
        gridBefore?: GridBefore | null
      } & PeriodOrigin)
    | null
  doses: PlannedDoseWrite[]
}
