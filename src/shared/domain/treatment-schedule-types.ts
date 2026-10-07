export type Frequency = { value: number; unit: 'day' | 'week' | 'month' }

export type TreatmentPeriodInput = {
  id: string
  startsOn: string
  firstDueOn: string
  /** Origine de la grille des échéances (le 31 d'un mensuel), la première échéance par défaut. */
  referenceOn: string
  endsOn: string | null
  stoppedOn: string | null
  frequency: Frequency
  /** Heures `HH:mm` de chaque jour d'échéance ; vide pour un traitement sans heure. */
  times: readonly string[]
  createdAt: string
}

/** `extra` : prise en plus ; `shift` : ligne de décalage des doses suivantes. */
export type DoseStatus = 'given' | 'missed' | 'postponed' | 'extra' | 'shift'

export type TreatmentDoseInput = {
  id: string
  periodId: string
  dueOn: string
  dueTime: string | null
  /** `null` pour une prise oubliée ou reportée. */
  givenOn: string | null
  status: DoseStatus
  /**
   * Pour un report, sa nouvelle date ; pour une ligne de décalage, sa date d'ancrage ; pour une prise,
   * la prochaine échéance calculée au geste, que le moteur ne relit pas.
   */
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

/** `shiftsFollowing` : la case « Décaler aussi les doses suivantes », cochée par défaut. */
export type DoseGesture =
  | { kind: 'given'; due: Due; givenOn: string; shiftsFollowing?: boolean }
  | { kind: 'missed'; due: Due }

export type DoseFields = Pick<
  TreatmentDoseInput,
  'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

/** Une ligne à créer, à réécrire, à supprimer, ou rien. */
export type LineChange =
  | { action: 'create'; dose: DoseFields }
  | { action: 'rewrite'; dose: DoseFields; doseId: string }
  | { action: 'delete'; doseId: string }
  | { action: 'none' }

/**
 * La prise à écrire, et la ligne de décalage qui fait repartir la suite de sa date réelle ;
 * `heldBy` : sans case, le décalage n'est pas écrit, il ferait passer ce report seul (son arrivée) ;
 * `lostToEnd` : sans case, les journées que le décalage fait sortir de la date de fin (Q4) ;
 * `keptToEnd` : celles qu'il aurait fait sortir, gardées parce qu'il n'est pas écrit.
 */
export type NotedDose = {
  dose: DoseFields
  shift: DoseFields | null
  heldBy?: string
  lostToEnd?: string[]
  keptToEnd?: string[]
}

/**
 * `shift` : la ligne de décalage de la prise, réancrée à sa nouvelle date, créée ou supprimée.
 * `postponement` : le report qui la suit (TR-24 bis), gardé et réécrit avec `line` et son décalage
 * avec `shiftLine` (ils visent désormais l'échéance que fixe la prise corrigée), ou dépassé : ses
 * lignes, décalage compris, sont à supprimer.
 */
export type RedatedDose = {
  dose: DoseFields
  shift: LineChange
  postponement:
    | {
        doseIds: string[]
        kept: true
        line: DoseFields
        shiftIds: string[]
        shiftLine: DoseFields
        /** I2 : le report seul suit la correction, dans les bornes de Q2 a. */
        followed?: true
      }
    /** `followedOn` (I2) : le report suit jusqu'à une échéance de ce jour, sa ligne devient inutile. */
    | { doseIds: string[]; kept: false; followedOn?: string }
    | null
}

/** Le report (créé, réécrit Q18, supprimé quand la dose revient à sa date) et sa ligne de décalage. */
export type MovedDose = { report: LineChange; shift: LineChange }

/** Bornes de « Prochaine dose » (TR-9) ; `latest` : la date de fin, `null` sans date de fin. */
export type MoveBounds = { earliest: string; latest: string | null }

/**
 * Pourquoi une dose ne se déplace pas : dose d'une période précédente ; dose plus lointaine déjà
 * déplacée (Q26) ou déjà notée ; plus aucune date avant la date de fin ; ligne de déplacement dont
 * la dose d'arrivée est déjà notée (Q25) ; seule, plus aucune date avant la dose suivante (Q2 a).
 */
export type MoveRefusal =
  | 'previous-period'
  | 'later-line'
  | 'later-dose'
  | 'no-date-left'
  | 'arrival-logged'
  | 'no-date-alone'

/**
 * Pourquoi un décalage ne se supprime pas : une dose plus loin dans la période est notée (N8) ; son
 * report a dépassé la dose suivante, qui resterait seul hors des bornes de Q2 a.
 */
export type ShiftRemovalRefusal = 'later-dose' | 'move-past-next' | 'move-off-rhythm'

/** Un report supprimé ramènerait sa dose (`dueOn`) à moins d'une demi-fréquence de la suivante. */
export type MoveRemovalRefusal = { dueOn: string; nextOn: string }

/**
 * Q2 a : le report seul (son arrivée) que la correction ferait passer ; `passes` : refusée dans cet
 * état de la case seulement ; `stuck` : le report ne peut suivre à aucune date.
 */
export type RedateRefusal = { on: string; reason: 'passes' | 'stuck' }

export type RedateLimits = { lastExtraDay: string | null; takenDays: string[] }

export type NewPeriod = { startsOn: string; firstDueOn: string; referenceOn: string }

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
  /**
   * Lignes de l'historique, une par échéance et par famille (prise, report, décalage), la plus
   * récemment modifiée ; sans les reports sans effet.
   */
  doses: TreatmentDoseInput[]
  /** Déplacements sans effet (dépassés, revenus à leur date) : à supprimer avec la prochaine écriture. */
  staleDoseIds: string[]
  currentPeriodId: string | null
  /**
   * TR-28 : une prise, même oubliée ou reportée, existe dans la période en cours (un décalage seul ne
   * compte pas, une prise en plus non plus).
   */
  currentPeriodHasDose: boolean
  /** Échéances sans prise à partir d'aujourd'hui inclus. */
  upcoming(limit: number): Due[]
  /** Échéance visée par une prise notée à cette date, à cette heure s'il y en a plusieurs. */
  dueForDate(givenOn: string, time?: string | null): Due | null
  /**
   * Lignes à écrire, calculées sur le carnet d'avant le geste (renseigner : un appel par dose). Donnée
   * un intervalle ou plus avant son échéance, la prise est une prise en plus, rangée sous sa date
   * réelle : elle ne change pas le calendrier.
   */
  doseFor(gesture: DoseGesture): NotedDose
  /**
   * TR-24 bis : nouvelle date d'une prise donnée. Une prise en plus vise alors l'échéance d'une prise
   * notée à cette date : elle peut redevenir une prise de la dose prévue.
   */
  redate(doseId: string, givenOn: string, shiftsFollowing?: boolean): RedatedDose
  /** La case « Décaler aussi les doses suivantes » de « Changer la date » vers ce jour. */
  redateOffersShift(doseId: string, givenOn: string): boolean
  /**
   * Q2 a : « Changer la date » vers ce jour, avec cet état de la case, ferait passer la dose suivante
   * à un report seul : son jour d'arrivée ; `null` si le geste est permis.
   */
  redateRefusal(doseId: string, givenOn: string, shiftsFollowing?: boolean): RedateRefusal | null
  /** Q2 a : même refus pour « Fait à une autre date », case cochée. */
  noteRefusal(due: Due, givenOn: string): string | null
  /** La case d’une prise notée : elle ferait repartir la suite de sa date réelle, date de fin comprise. */
  offersShift(due: Due, givenOn: string): boolean
  /**
   * Chemin de « Prochaine dose » (TR-9, TR-28) : sans prise dans la période, elle corrige la première
   * échéance (`firstDueOn` réécrit, sans ligne ni bornes de déplacement) ; sinon elle déplace la dose.
   */
  nextDoseChange: 'correction' | 'move' | null
  /**
   * Jours que « Changer la date » refuse : une prise donnée ne descend pas à `lastExtraDay` ou avant
   * (elle y deviendrait une prise en plus) ; une prise en plus ne va pas sur un jour qui en a déjà une.
   */
  redateLimits(doseId: string): RedateLimits
  /**
   * Déplace la dose, plus tôt ou plus tard (TR-9, Q17, Q18) ; une ligne réécrite peut changer
   * d'échéance d'origine. Sans `shiftsFollowing`, le report va seul et le décalage de son échéance
   * est supprimé.
   */
  move(due: Due, to: string, shiftsFollowing?: boolean): MovedDose
  /** Bornes d'un déplacement, pas d'une correction de première échéance ; `null` : voir `moveRefusal`. */
  moveBounds(due: Due, shiftsFollowing?: boolean): MoveBounds | null
  /** Raison pour laquelle cette dose ne se déplace pas, `null` si elle se déplace. */
  moveRefusal(due: Due, shiftsFollowing?: boolean): MoveRefusal | null
  /** Déplacements dont la dose d'arrivée est notée (Q25) : ni « Changer la date » ni « Supprimer ce report ». */
  lockedMoveIds: string[]
  /**
   * « Supprimer ce report » (TR-24) : la ligne à supprimer, son décalage reste (N8) ; lève si elle
   * est verrouillée (Q25) ou refusée (`moveRemovalRefusal`).
   */
  removeMove(doseId: string): MovedDose
  moveRemovalRefusal(doseId: string): MoveRemovalRefusal | null
  /** « Supprimer ce décalage » (N7) : la ligne seule ; lève si `shiftRemovalRefusal` la refuse. */
  removeShift(doseId: string): LineChange
  shiftRemovalRefusal(doseId: string): ShiftRemovalRefusal | null
  /** `move-off-rhythm` : l'arrivée du report seul à supprimer d'abord. */
  strandedMoveOn(doseId: string): string | null
  /** L'échéance qui porte le décalage d'une prise : pour une dose avancée, son échéance d'origine (G18). */
  shiftDueOf(due: Due): Due
  /** Dates d'une période ouverte par « Modifier » (TR-28, Q7, Q24), selon ses heures. */
  newPeriod(frequency: Frequency, times: readonly string[]): NewPeriod
  /**
   * Dernière journée d'échéance de la période en cours, reports et décalages compris, notée ou non ;
   * `null` sans période ou pour une période sans fin.
   */
  lastDueDay(): string | null
}

export type Sequence = { origin: string; firstStep: number; floor: string }

export type Step = { kind: 'note' | 'move' | 'shift'; dose: TreatmentDoseInput; position: string }

export type PeriodTimeline = {
  period: TreatmentPeriodInput
  closesOn: string | null
  steps: Step[]
  stale: TreatmentDoseInput[]
  /** La suite de la période, puis celles des lignes de décalage, dans l'ordre. */
  anchors: { position: string; sequence: Sequence }[]
  /** Échéances avant la dernière suite, et jours d'arrivée des reports. */
  between: Due[]
  /** Jour d'origine d'un report → sa première clé : la journée part à partir de là (Q21). */
  removals: Map<string, string>
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
  /** Échéances qui ont une ligne lue par le moteur : prise, report ou décalage en vigueur. */
  lines: Set<string>
  plans: PeriodTimeline[]
  open: PeriodTimeline | null
  phase: TreatmentPhase
  currentDoses: Due[]
  unloggedDoses: Due[]
}
