export type Frequency = { value: number; unit: 'day' | 'week' | 'month' }

export type TreatmentPeriodInput = {
  id: string
  startsOn: string
  firstDueOn: string
  endsOn: string | null
  stoppedOn: string | null
  frequency: Frequency
  /** Heures `HH:mm` de chaque jour d'échéance ; vide pour un traitement sans heure. */
  times: readonly string[]
  createdAt: string
}

export type DoseStatus = 'given' | 'missed' | 'postponed'

export type TreatmentDoseInput = {
  id: string
  periodId: string
  dueOn: string
  dueTime: string | null
  /** `null` pour une prise oubliée ou reportée. */
  givenOn: string | null
  status: DoseStatus
  /** Prochaine échéance fixée par la prise ; pour un report, sa nouvelle date. */
  nextDueDate: string
  createdAt: string
  updatedAt: string
}

/** Entrée vérifiée : une donnée illisible ou démesurée lève une `RangeError` qui la nomme. */
export type TreatmentScheduleInput = {
  periods: readonly TreatmentPeriodInput[]
  doses: readonly TreatmentDoseInput[]
  /** `yyyy-MM-dd` : le module ne lit jamais l'horloge. */
  today: string
}

export type Due = { periodId: string; dueOn: string; dueTime: string | null }

/** `ended` : date de fin passée, dernière échéance notée, ou aucune période. */
export type TreatmentPhase = 'upcoming' | 'today' | 'overdue' | 'ended' | 'stopped'

export type DoseGesture =
  { kind: 'given'; due: Due; givenOn: string } | { kind: 'missed'; due: Due }

export type DoseFields = Pick<
  TreatmentDoseInput,
  'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

/**
 * `postponement` : le déplacement gardé (TR-24 bis), à réécrire avec `line` (il vise désormais
 * l'échéance que fixe la prise corrigée), ou ceux que la nouvelle date laisse sans effet, à supprimer.
 */
export type RedatedDose = {
  dose: DoseFields
  postponement:
    { doseIds: string[]; kept: true; line: DoseFields } | { doseIds: string[]; kept: false } | null
}

/** Ligne de déplacement à créer, à réécrire (Q18), à supprimer quand la dose revient à sa date, ou rien. */
export type MovedDose =
  | { action: 'create'; dose: DoseFields }
  | { action: 'rewrite'; dose: DoseFields; doseId: string }
  | { action: 'delete'; doseId: string }
  | { action: 'none' }

/** Bornes de « Prochaine dose » (TR-9) ; `latest` : la date de fin, `null` sans date de fin. */
export type MoveBounds = { earliest: string; latest: string | null }

/**
 * Pourquoi une dose ne se déplace pas : dose d'une période précédente ; dose plus lointaine déjà
 * déplacée (Q26) ou déjà notée ; plus aucune date avant la date de fin ; ligne de déplacement dont
 * la dose d'arrivée est déjà notée (Q25).
 */
export type MoveRefusal =
  'previous-period' | 'later-line' | 'later-dose' | 'no-date-left' | 'arrival-logged'

export type NewPeriod = { startsOn: string; firstDueOn: string }

export type TreatmentSchedule = {
  phase: TreatmentPhase
  /** Fini ou arrêté sans rien à renseigner (« Traitements terminés ») ; vrai aussi sans période. */
  finished: boolean
  /** Doses du moment (TR-10, Q23) : heures sans prise de la dernière journée arrivée, du jour ou toutes en retard ; sinon la prochaine. */
  currentDoses: Due[]
  /** Première échéance sans prise après aujourd'hui. */
  nextDue: Due | null
  /** Doses non renseignées (TR-13), jamais comptées comme des retards. */
  unloggedDoses: Due[]
  /** Lignes de l'historique, une par échéance (la plus récemment modifiée) ; sans les déplacements sans effet. */
  doses: TreatmentDoseInput[]
  /** Déplacements sans effet (dépassés, revenus à leur date) : à supprimer avec la prochaine écriture. */
  staleDoseIds: string[]
  currentPeriodId: string | null
  /** TR-28 : une prise, même oubliée ou reportée, existe dans la période en cours. */
  currentPeriodHasDose: boolean
  /** Échéances sans prise à partir d'aujourd'hui inclus. */
  upcoming(limit: number): Due[]
  /** Échéance visée par une prise notée à cette date, à cette heure s'il y en a plusieurs. */
  dueForDate(givenOn: string, time?: string | null): Due | null
  /** Champs de la prise à écrire, calculés sur le carnet d'avant le geste (renseigner : un appel par dose). */
  doseFor(gesture: DoseGesture): DoseFields
  /** TR-24 bis : nouvelle date d'une prise donnée. */
  redate(doseId: string, givenOn: string): RedatedDose
  /**
   * Chemin de « Prochaine dose » (TR-9, TR-28) : sans prise dans la période, elle corrige la première
   * échéance (`firstDueOn` réécrit, sans ligne ni bornes de déplacement) ; sinon elle déplace la dose.
   */
  nextDoseChange: 'correction' | 'move' | null
  /** Déplace la dose, plus tôt ou plus tard (TR-9, Q17, Q18) ; une ligne réécrite peut changer d'échéance d'origine. */
  move(due: Due, to: string): MovedDose
  /** Bornes d'un déplacement, pas d'une correction de première échéance ; `null` : voir `moveRefusal`. */
  moveBounds(due: Due): MoveBounds | null
  /** Raison pour laquelle cette dose ne se déplace pas, `null` si elle se déplace. */
  moveRefusal(due: Due): MoveRefusal | null
  /** Déplacements dont la dose d'arrivée est notée (Q25) : ni « Changer la date » ni « Supprimer ce report ». */
  lockedMoveIds: string[]
  /** « Supprimer ce report » (TR-24) : la ligne à supprimer ; lève si elle est verrouillée (Q25). */
  removeMove(doseId: string): MovedDose
  /** Dates d'une période ouverte par « Modifier » (TR-28, Q7, Q24), selon ses heures. */
  newPeriod(frequency: Frequency, times: readonly string[]): NewPeriod
}

export type Sequence = { origin: string; firstStep: number; floor: string }

export type Step = { kind: 'note' | 'move'; dose: TreatmentDoseInput; position: string }

export type PeriodPlan = {
  period: TreatmentPeriodInput
  closesOn: string | null
  steps: Step[]
  stale: TreatmentDoseInput[]
  anchors: { position: string; sequence: Sequence }[]
  between: Due[]
  noteKeys: Set<string>
  noteDays: Set<string>
  covered: Set<string>
  fallenKeys: string[]
}

export type Window = { from?: string; to?: string; limit?: number }

export type DueEntry = { due: Due; status: DoseStatus | null }

export type State = {
  input: TreatmentScheduleInput
  noted: Set<string>
  plans: PeriodPlan[]
  open: PeriodPlan | null
  phase: TreatmentPhase
  currentDoses: Due[]
  unloggedDoses: Due[]
}
