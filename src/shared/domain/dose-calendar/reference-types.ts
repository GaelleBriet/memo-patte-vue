/** Entrée et sortie du modèle de référence : réglages et lignes du carnet, échéances lues. */
export type ReferenceFrequency = { value: number; unit: 'day' | 'week' | 'month' }

export type ReferenceSetting = {
  id: string
  startsOn: string
  firstDueOn: string
  /** `null` : l'origine en vigueur au premier jour du réglage, héritée du précédent (R3). */
  gridOriginOn: string | null
  endsOn: string | null
  stoppedOn: string | null
  frequency: ReferenceFrequency
  times: readonly string[]
  createdAt: string
}

export type ReferenceLine = {
  id: string
  settingId: string
  dueOn: string
  dueTime: string | null
  status: 'given' | 'missed' | 'extra' | 'postponed' | 'shift'
  /** Report : jour d'arrivée ; décalage : jour d'ancrage. */
  targetOn: string | null
  updatedAt: string
}

export type ReferenceInput = {
  settings: readonly ReferenceSetting[]
  lines: readonly ReferenceLine[]
  today: string
  /** Dernier jour lu des échéances à venir. */
  until: string
}

export type ReferencePhase = 'upcoming' | 'today' | 'overdue' | 'ended' | 'stopped'

/** Échéances en clés `yyyy-MM-dd HH:mm`, ou `yyyy-MM-dd` sans heure, triées. */
export type ReferenceReading = {
  phase: ReferencePhase
  finished: boolean
  current: string[]
  unlogged: string[]
  upcoming: string[]
}
