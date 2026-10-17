/** Un jour `yyyy-MM-dd` ; le moteur ne lit jamais l'horloge, aujourd'hui lui est donné. */
export type Day = string

/** Une heure `HH:mm`, ou `null` pour un traitement sans heure. */
export type Hour = string | null

export type Frequency = { value: number; unit: 'day' | 'week' | 'month' }

/** Réglage (R1) : valable de `startsOn` jusqu'au premier jour du réglage suivant. */
export type Setting = {
  id: string
  startsOn: Day
  firstDueOn: Day
  /** Origine de la grille (R2) ; `null` : celle en vigueur au premier jour du réglage (R3). */
  gridOriginOn: Day | null
  /** #836 : la première échéance vient de la personne, pas d'une date proposée par l'app (R9, R10). */
  firstDueChosen: boolean
  /** #817, Q38 : réponse « Elles restent à renseigner » ; la dose en retard reste en retard (R10). */
  pastDosesStayUnlogged: boolean
  endsOn: Day | null
  stoppedOn: Day | null
  frequency: Frequency
  times: readonly string[]
  createdAt: string
  /** Dernière réécriture du réglage (R10, #867) ; absente : date inconnue. */
  updatedAt?: string
  /** #873 : jour de cette réécriture, celui de la réponse à la question Q38 ; absent : inconnu. */
  writtenOn?: Day
}

export type LineStatus = 'given' | 'missed' | 'extra' | 'postponed' | 'shift'

/** Ligne écrite par la personne : prise, prise en plus, report, décalage. */
export type Line = {
  id: string
  /** Réglage dont la posologie s'applique ; il ne borne pas le calendrier. */
  settingId: string
  dueOn: Day
  dueTime: Hour
  status: LineStatus
  givenOn: Day | null
  /** Report : jour d'arrivée ; décalage : jour d'ancrage ; `null` pour une prise. */
  targetOn: Day | null
  updatedAt: string
}

export type CalendarInput = { settings: readonly Setting[]; lines: readonly Line[] }

export type TreatmentViewInput = CalendarInput & { today: Day }

/** Une échéance : un jour, une heure, et le réglage qui la produit. */
export type Due = { settingId: string; dueOn: Day; dueTime: Hour }

/** `covered` : couverte par une prise d'une autre échéance (heures changées, reprise, R4). */
export type DueState = 'pending' | 'given' | 'missed' | 'covered' | 'moved' | 'removed'

/** Pourquoi une ligne n'a pas d'effet (R11) ; elle reste dans l'historique. */
export type IdleReason =
  | 'superseded'
  | 'back-to-date'
  | 'beaten'
  | 'nothing-to-move'
  | 'nothing-to-cover'
  | 'outside'
  | 'overtaken'
  | 'unknown-setting'

/** Ce qu'une ligne fait au calendrier : la clé de l'échéance couverte, ou les échéances déplacées. */
export type LineEffect =
  | { kind: 'covers'; key: string }
  | {
      kind: 'moves'
      keys: string[]
      arrival: Day | null
      /** R9.2 : son arrivée est la première échéance d'un nouveau rythme, qui ne garde que ses heures. */
      opensRhythm?: true
    }
  | { kind: 'shifts'; from: Day }
  | { kind: 'extra' }
  | { kind: 'idle'; reason: IdleReason }

export type Phase = 'upcoming' | 'today' | 'overdue' | 'ended' | 'stopped'

/** Les champs d'une ligne à écrire ; l'identifiant et l'horodatage viennent du repository. */
export type LineFields = Omit<Line, 'id' | 'updatedAt'>

/** Les champs d'un réglage à écrire ; l'arrêt passe par « Arrêter », l'identifiant par le repository. */
export type SettingFields = Omit<Setting, 'id' | 'createdAt' | 'stoppedOn'>

/**
 * Ce que « Modifier » écrit : un réglage ouvert aujourd'hui, ou le réglage en cours corrigé (R10,
 * TR-28) ; `lines` : le report que la date choisie fait arriver ce jour-là (R7, #796).
 */
export type SettingsPlan = (
  | { action: 'create'; setting: SettingFields }
  | { action: 'rewrite'; id: string; setting: SettingFields }
) & { lines?: Exclude<LineChange, { action: 'create' }>[] }

/** Ce qu'un geste écrit : une ligne créée, réécrite ou supprimée ; le moteur n'écrit jamais lui-même. */
export type LineChange =
  | { action: 'create'; line: LineFields }
  | { action: 'rewrite'; id: string; line: LineFields }
  | { action: 'delete'; id: string }

/** `shiftsFollowing` : la case « Décaler aussi les doses suivantes », sans effet quand elle n'est pas proposée. */
export type Gesture =
  | { kind: 'note'; due: Due; status: 'given' | 'missed'; givenOn: Day; shiftsFollowing: boolean }
  | { kind: 'move'; due: Due; to: Day; shiftsFollowing: boolean }
  | { kind: 'redate'; lineId: string; givenOn: Day; shiftsFollowing: boolean }
  | { kind: 'remove'; lineId: string }

/** Pourquoi un geste n'est pas permis ; chaque raison a son texte existant à l'écran. */
export type Refusal =
  | { reason: 'later-dose' }
  | { reason: 'later-line' }
  | { reason: 'no-date-left' }
  | { reason: 'no-date-alone' }
  | { reason: 'no-dose-before-end' }
  | { reason: 'arrival-logged' }
  | { reason: 'not-movable' }
  | { reason: 'unknown-due' }
  | { reason: 'out-of-bounds'; earliest: Day; latest: Day | null }
  | { reason: 'too-early'; earliest: Day }
  | { reason: 'day-taken' }
  | { reason: 'stuck-report'; on: Day }
  | { reason: 'report-loop' }
  | { reason: 'report-past-next'; on: Day }
  | { reason: 'report-off-rhythm'; on: Day }

/** Un report seul que le geste réécrit pour suivre la correction (G19) : arrivée d'avant, d'après. */
export type FollowedReport = { from: Day; to: Day | null }

export type GestureOutcome = {
  changes: LineChange[]
  offersShift: boolean
  /** G20, Q4 : journées que le décalage fait sortir de la date de fin. */
  lostToEnd: Day[]
  /** G21 : échéances passées que le geste rend à renseigner ou en retard. */
  newlyDue: Due[]
  followed: FollowedReport[]
}

export type GestureResult = GestureOutcome | { refusal: Refusal }
