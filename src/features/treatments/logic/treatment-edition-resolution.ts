import type {
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { MoveRefusal, MovedDose } from '@/shared/domain/treatment-schedule'

/** Ce que le champ « Prochaine dose » dit sous sa date. */
export type NextDoseHelp =
  | { kind: 'refused'; refusal: MoveRefusal }
  /** Échéances passées que la nouvelle première échéance fait disparaître. */
  | { kind: 'dropped'; count: number }
  | { kind: 'overdue'; since: string }
  /** Aucune prise dans tout le traitement : faute de référence, aujourd'hui est proposé. */
  | { kind: 'today' }
  | { kind: 'calculated'; on: string }
  /** Date reprise du calendrier en cours, report compris (Q37). */
  | { kind: 'scheduled'; on: string }
  /** La date calculée est passée : aujourd'hui est proposé à sa place. */
  | { kind: 'calculated-passed'; on: string }

/**
 * La case « Décaler aussi les doses suivantes » sous la date choisie : les journées qui suivraient la
 * dose déplacée, et celles que le décalage ferait sortir de la date de fin (Q4).
 */
export type NextDoseShift = {
  following: string[]
  /** Case décochée ; vide quand la dose ne peut pas aller seule à cette date. */
  followingAlone: string[]
  lost: string[]
  /** Dernier jour d'un report seul (Q2 a), `null` sans autre borne que la date de fin. */
  aloneLatest: string | null
}

export type NextDoseDraft = {
  /** `first-due` : la date choisie devient la première échéance de la période ; `move` : une ligne « Reportée / Avancée ». */
  change: 'first-due' | 'move'
  proposedOn: string
  earliest: string
  /** La date de fin saisie, ou la veille de la dose suivante pour un report seul ; `null` sans borne. */
  latest: string | null
  refusal: MoveRefusal | null
  help: NextDoseHelp | null
  /** `null` : pas de case, la date ne déplace aucune dose ou la dose ne peut aller seule. */
  shift: NextDoseShift | null
  /** N2 : la case rouverte telle qu'elle a été laissée, cochée sans report ou avec son décalage. */
  shiftInitial: boolean
}

/** Ce que « Modifier » fait des réglages saisis, et ce qu'il écrirait. */
export type EditionResolution = {
  period: TreatmentPeriodRecord
  /** `locked` : traitement arrêté ou fini, seuls le nom et le type se corrigent ; `open` : nouvelle période (TR-28). */
  change: 'locked' | 'correct' | 'open'
  /** `null` : aucune dose à venir. */
  nextDose: NextDoseDraft | null
  settings: TreatmentPeriodSettings
  /** Origine de la grille de la période écrite (le 31 d'un mensuel), sa première échéance sinon. */
  referenceOn: string
  move: MovedDose | null
  /** Ligne de déplacement de la prochaine dose, que la saisie peut réécrire. */
  movedLineId: string | null
  /** La première échéance vient de `newPeriod` : la date de fin doit la suivre. */
  proposesFirstDue: boolean
}

/** La date saisie dans « Prochaine dose » et la case « Décaler aussi les doses suivantes ». */
export type NextDoseChoice = { chosenOn: string | null; shiftsFollowing: boolean }
