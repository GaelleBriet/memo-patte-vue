import type { Carnet } from './treatment-shift-help'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Due, GestureOutcome, Refusal, SettingsPlan } from '@/shared/domain/dose-calendar'

/** Ce que le champ « Prochaine dose » dit sous sa date. */
export type NextDoseHelp =
  | { kind: 'refused'; refusal: Refusal }
  | { kind: 'overdue'; since: string }
  /** Aucune prise dans tout le traitement : faute de référence, aujourd'hui est proposé. */
  | { kind: 'today' }
  | { kind: 'calculated'; on: string }
  /** La date calculée est passée : aujourd'hui est proposé à sa place. */
  | { kind: 'calculated-passed'; on: string }
  /** Date reprise du calendrier en cours, report compris (Q37). */
  | { kind: 'scheduled'; on: string }

/** La case « Décaler aussi les doses suivantes » sous la date choisie : la dose déplacée, lue sur le carnet. */
export type NextDoseShift = { due: Due; chosenOn: string; carnet: Carnet }

export type NextDoseDraft = {
  /** `move` : une ligne « Reportée / Avancée » ; `first-due` : la date choisie ouvre un réglage ou corrige la première échéance. */
  change: 'first-due' | 'move'
  proposedOn: string
  earliest: string
  /** La date de fin saisie, ou la veille de la dose suivante pour un report seul ; `null` sans borne. */
  latest: string | null
  /** Le moteur refuse tout déplacement de cette dose : le champ est grisé. */
  refusal: Refusal | null
  help: NextDoseHelp | null
  /** `null` : pas de case, la date ne déplace aucune dose ou la dose ne peut aller seule. */
  shift: NextDoseShift | null
  /** N2 : la case rouverte telle qu'elle a été laissée, cochée sans report ou avec son décalage. */
  shiftInitial: boolean
}

/** La première échéance que chaque réponse à Q38 écrirait ; `drop` vaut `null` quand elle est refusée (#806). */
export type PastDuesNextDose = { keep: string; drop: string | null }

/** Ce que « Modifier » fait des réglages saisis, et ce qu'il écrirait. */
export type EditionResolution = {
  period: TreatmentPeriodRecord
  /** `locked` : traitement arrêté ou fini, seuls le nom et le type se corrigent. */
  change: 'locked' | 'edit'
  /** `null` : aucune dose à venir à proposer. */
  nextDose: NextDoseDraft | null
  /**
   * Le réglage que `newSettings` écrit ; `null` : rien de tel à écrire, le réglage en cours se
   * corrige sur place (date de fin, rappel) ou ne change pas.
   */
  plan: SettingsPlan | null
  /** R7, TR-9 : le report de la prochaine dose que la saisie écrit, quand seule sa date change. */
  move: GestureOutcome | null
  /** Le moteur refuse ce que la saisie demande : la date, ou le rythme, ne passe pas. */
  refusal: Refusal | null
  /** Échéances tombées que le nouveau rythme laisserait à renseigner ou retirerait (Q38). */
  pastDues: Due[]
  /** `null` sans question à poser. */
  pastDuesNextDose: PastDuesNextDose | null
}

/** La date saisie dans « Prochaine dose » et la case « Décaler aussi les doses suivantes ». */
export type NextDoseChoice = { chosenOn: string | null; shiftsFollowing: boolean }
