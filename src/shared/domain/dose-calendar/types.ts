/** Un jour `yyyy-MM-dd` ; le moteur ne lit jamais l'horloge, aujourd'hui lui est donné. */
export type Day = string

/** Une heure `HH:mm`, ou `null` pour un traitement sans heure. */
export type Hour = string | null

export type Frequency = { value: number; unit: 'day' | 'week' | 'month' }

/** Une suite régulière de journées, sur la grille de son premier jour, jusqu'au dernier (`null` : sans fin). */
export type GridRun = readonly [from: Day, to: Day | null]

/**
 * La grille que le moteur lisait juste avant l'ouverture d'une période, à partir de son premier jour,
 * et la date de grille de la période qu'elle remplaçait.
 */
export type GridBefore = {
  frequency: Frequency
  endsOn: Day | null
  writtenAt: string
  runs: readonly GridRun[]
}

export const FALLEN_DOSES_ANSWERS = ['unasked', 'stay-unlogged', 'not-due'] as const

/** Q38, #873 : réponse à la question des doses tombées ; `unasked` : aucune question posée. */
export type FallenDosesAnswer = (typeof FALLEN_DOSES_ANSWERS)[number]

/** Réglage (R1) : valable de `startsOn` jusqu'au premier jour du réglage suivant. */
export type Setting = {
  id: string
  startsOn: Day
  firstDueOn: Day
  /** Origine de la grille (R2) ; `null` : celle en vigueur au premier jour du réglage (R3). */
  gridOriginOn: Day | null
  /** #836 : la première échéance vient de la personne, pas d'une date proposée par l'app (R9, R10). */
  firstDueChosen: boolean
  /** #817 : avec « Elles restent à renseigner », la dose en retard reste en retard (R10). */
  fallenDosesAnswer: FallenDosesAnswer
  endsOn: Day | null
  stoppedOn: Day | null
  frequency: Frequency
  times: readonly string[]
  createdAt: string
  /** Dernière réécriture du réglage (R10, #867) ; absente : date inconnue. */
  updatedAt?: string
  /** Dernière écriture de la grille (première échéance, fréquence, origine, fin), heures exclues ; absente : inconnue. */
  gridWrittenAt?: string
  /** La grille d'avant l'ouverture, posée par « Modifier » ; absente ou `null` : aucune à reprendre. */
  gridBefore?: GridBefore | null
}

export type LineStatus = 'given' | 'missed' | 'extra' | 'postponed' | 'shift' | 'not-due'

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
  /** Report déplacé de nouveau (G13) : jour et heure de son arrivée d'avant ; absent ou `null` sinon. */
  previousTargetOn?: Day | null
  previousTargetTime?: Hour
  /** Report : rang, à partir de 1, de son heure dans sa journée d'origine ; absent ou `null` : inconnu. */
  dueRank?: number | null
  /** Instant du geste qui a décidé la ligne : seule horloge que le moteur arbitre entre lignes et réglages. */
  decidedAt: string
  /** Téléphone qui a créé la ligne ; absent hors de l'app. */
  createdByDevice?: string
}

export type CalendarInput = { settings: readonly Setting[]; lines: readonly Line[] }

/** `device` : le téléphone qui fait le geste, dont la ligne est réécrite (TR-25, #931). */
export type TreatmentViewInput = CalendarInput & { today: Day; device?: string }

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
export type LineFields = Omit<Line, 'id' | 'decidedAt' | 'createdByDevice'>

/** Les champs d'un réglage à écrire ; l'arrêt passe par « Arrêter », l'identifiant par le repository. */
export type SettingFields = Omit<Setting, 'id' | 'createdAt' | 'stoppedOn'>

/**
 * Ce que « Modifier » écrit : un réglage ouvert aujourd'hui, ou le réglage en cours corrigé (R10,
 * TR-28) ; `lines` : le report que la date choisie fait arriver ce jour-là (R7, #796), ou une ligne
 * « pas à donner » par dose que la question a montrée (#873).
 */
export type SettingsPlan = (
  | { action: 'create'; setting: SettingFields }
  | { action: 'rewrite'; id: string; setting: SettingFields }
) & { lines?: LineChange[] }

/** Ce qu'un geste écrit : une ligne créée, réécrite ou supprimée ; le moteur n'écrit jamais lui-même. */
export type LineChange =
  | { action: 'create'; line: LineFields }
  | { action: 'rewrite'; id: string; line: LineFields }
  | { action: 'delete'; id: string }

/** R5 : la réponse à « Cette prise » ; sans réponse, la règle par distance (« Changer la date », anciens exports). */
export type ExtraAnswer = 'extra' | 'replaces'

/**
 * `shiftsFollowing` : la case « Décaler aussi les doses suivantes », sans effet quand elle n'est pas
 * proposée ; `answer` : sans effet quand la question ne se pose pas.
 */
export type Gesture =
  | {
      kind: 'note'
      due: Due
      status: 'given' | 'missed'
      givenOn: Day
      shiftsFollowing: boolean
      answer?: ExtraAnswer
    }
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
