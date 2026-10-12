import type { PastDuesChoice } from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Due, Refusal, SettingsPlan } from '@/shared/domain/dose-calendar'

/** Ce que le champ « Prochaine dose » dit sous sa date. */
export type NextDoseHelp =
  | { kind: 'overdue'; since: string }
  /** Aucune prise dans tout le traitement : faute de référence, aujourd'hui est proposé. */
  | { kind: 'today' }
  | { kind: 'calculated'; on: string }
  /** Date reprise du calendrier en cours, report compris (Q37). */
  | { kind: 'scheduled'; on: string }

export type NextDoseDraft = {
  proposedOn: string
  earliest: string
  /** La date de fin saisie ; `null` sans borne. */
  latest: string | null
  help: NextDoseHelp | null
}

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
  /** Le moteur refuse ce réglage : la date, ou le rythme, ne passe pas. */
  refusal: Refusal | null
  /** Échéances tombées que le nouveau rythme laisserait à renseigner ou retirerait (Q38). */
  pastDues: Due[]
  /** La première échéance que chaque réponse écrirait ; `null` sans question à poser. */
  pastDuesNextDose: Record<PastDuesChoice, string> | null
}

/** La date saisie dans « Prochaine dose ». */
export type NextDoseChoice = { chosenOn: string | null }
