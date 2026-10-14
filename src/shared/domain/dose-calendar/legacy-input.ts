import { isOnGrid, sameFrequency } from './grid'
import type { Day, Line, LineStatus, Setting } from './types'

export type SettingFacts = Pick<Setting, 'firstDueChosen' | 'pastDosesStayUnlogged'>

/** Réglage tel que le schéma v11 l'enregistre : `referenceOn` porte encore plusieurs sens. */
export type LegacyPeriod = Omit<Setting, 'gridOriginOn' | keyof SettingFacts> & { referenceOn: Day }

/**
 * Schéma v12 → v13 : un réglage écrit sans ces faits se lit comme avant eux, toute origine posée
 * comme une date choisie, aucune réponse « Elles restent à renseigner ».
 */
export function legacyFactsOf(gridOriginOn: Day | null): SettingFacts {
  return { firstDueChosen: gridOriginOn !== null, pastDosesStayUnlogged: false }
}

/** Ligne telle que le schéma v11 l'enregistre : `nextDueDate`, relu seulement pour un report ou un décalage. */
export type LegacyDose = Omit<Line, 'settingId' | 'targetOn'> & {
  periodId: string
  status: LineStatus
  nextDueDate: Day
}

type Ordered = Pick<Setting, 'id' | 'startsOn' | 'createdAt'>

/** Plan §3.1 : l'origine est `referenceOn` quand sa grille passe par la première échéance (le 31 d'un mensuel). */
function ownOrigin({
  referenceOn,
  frequency,
  firstDueOn,
}: Pick<LegacyPeriod, 'referenceOn' | 'frequency' | 'firstDueOn'>): Day {
  return isOnGrid(referenceOn, frequency, firstDueOn) ? referenceOn : firstDueOn
}

/** Plan §3.2 : seuls un report et un décalage ont un jour d'arrivée. */
export function targetOnOf({ status, nextDueDate }: Pick<LegacyDose, 'status' | 'nextDueDate'>) {
  return status === 'postponed' || status === 'shift' ? nextDueDate : null
}

// R1, R9 : un réglage remplacé avant son premier jour cède sa place à un réglage écrit après lui.
function inOrder<P extends Ordered>(periods: readonly P[]): P[] {
  const startOf = (period: P) =>
    periods
      .filter(({ createdAt }) => createdAt > period.createdAt)
      .reduce((day, newer) => (newer.startsOn < day ? newer.startsOn : day), period.startsOn)
  return [...periods].sort(
    (a, b) =>
      startOf(a).localeCompare(startOf(b)) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  )
}

type LegacyRecord = Pick<
  LegacyPeriod,
  'id' | 'startsOn' | 'createdAt' | 'stoppedOn' | 'frequency' | 'referenceOn' | 'firstDueOn'
>

/**
 * Schéma v11 → v12 (plan §3.1), comme l'app relisait `referenceOn` : `null` (héritée, R3) quand le
 * réglage suit sans arrêt un réglage de même fréquence et de même référence, sinon son origine.
 */
export function gridOriginsOf(periods: readonly LegacyRecord[]): Map<string, Day | null> {
  const ordered = inOrder(periods)
  return new Map(
    ordered.map((period, index) => {
      const previous = ordered[index - 1]
      const inherits =
        previous !== undefined &&
        previous.stoppedOn === null &&
        sameFrequency(previous.frequency, period.frequency) &&
        previous.referenceOn === period.referenceOn
      return [period.id, inherits ? null : ownOrigin(period)] as const
    }),
  )
}
