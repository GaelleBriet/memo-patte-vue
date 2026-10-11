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
  endsOn: Day | null
  stoppedOn: Day | null
  frequency: Frequency
  times: readonly string[]
  createdAt: string
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
  | { kind: 'moves'; keys: string[]; arrival: Day | null }
  | { kind: 'shifts'; from: Day }
  | { kind: 'extra' }
  | { kind: 'idle'; reason: IdleReason }

export type Phase = 'upcoming' | 'today' | 'overdue' | 'ended' | 'stopped'
