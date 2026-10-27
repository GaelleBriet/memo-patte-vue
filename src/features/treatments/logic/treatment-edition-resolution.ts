import type { Carnet } from './treatment-shift-help'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Due, GestureOutcome, Refusal, SettingsPlan } from '@/shared/domain/dose-calendar'

export type NextDoseHelp =
  | { kind: 'refused'; refusal: Refusal }
  | { kind: 'overdue'; since: string }
  | { kind: 'today' }
  | { kind: 'calculated'; on: string }
  | { kind: 'calculated-passed'; on: string }
  | { kind: 'scheduled'; on: string }

export type NextDoseShift = { due: Due; chosenOn: string; carnet: Carnet }

export type NextDoseDraft = {
  change: 'first-due' | 'move'
  proposedOn: string
  earliest: string
  /** `null` sans borne. */
  latest: string | null
  refusal: Refusal | null
  help: NextDoseHelp | null
  /** `null` : la date ne déplace aucune dose, ou la dose ne peut aller seule. */
  shift: NextDoseShift | null
  shiftInitial: boolean
}

export type PastDuesNextDose = { keep: string; drop: string | null }

export type EditionResolution = {
  period: TreatmentPeriodRecord
  change: 'locked' | 'edit'
  nextDose: NextDoseDraft | null
  /** `null` : le réglage en cours se corrige sur place ou ne change pas. */
  plan: SettingsPlan | null
  move: GestureOutcome | null
  refusal: Refusal | null
  pastDues: Due[]
  pastDuesNextDose: PastDuesNextDose | null
}

export type NextDoseChoice = { chosenOn: string | null; shiftsFollowing: boolean }
