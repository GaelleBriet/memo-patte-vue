import { continuesGrid, isOnGrid, sameFrequency } from './grid'
import type { Day, Setting, SettingFields } from './types'

/** Ce qui fait la grille d'une période, et son arrêt. */
export type GridFacts = Pick<
  Setting,
  'firstDueOn' | 'gridOriginOn' | 'firstDueChosen' | 'frequency' | 'endsOn' | 'stoppedOn'
>

type Opening = Pick<SettingFields, 'startsOn' | Exclude<keyof GridFacts, 'stoppedOn'>>

const DAYS_PER_UNIT = { day: 1, week: 7 } as const

// La même suite de jours : semaines et jours se convertissent, un mois jamais.
function sameSteps(a: Setting['frequency'], b: Setting['frequency']): boolean {
  if (a.unit === 'month' || b.unit === 'month') return sameFrequency(a, b)
  return a.value * DAYS_PER_UNIT[a.unit] === b.value * DAYS_PER_UNIT[b.unit]
}

// L'origine que le moteur garde dans l'épisode en cours, décalages exclus.
function originOf(periods: readonly GridFacts[]): Day {
  const stops = periods.map(({ stoppedOn }, index) => (stoppedOn === null ? -1 : index))
  const episode = periods.slice(Math.max(...stops) + 1)
  let origin = episode[0]!.gridOriginOn ?? episode[0]!.firstDueOn
  episode.forEach((period, index) => {
    if (index > 0 && !continuesGrid(origin, episode[index - 1], period)) {
      origin = period.gridOriginOn ?? period.firstDueOn
    }
  })
  return origin
}

/**
 * La période qui s'ouvre reprend la grille de la dernière sans la changer : même suite de jours, même
 * fin, origine vide ou sur l'ancienne grille, première échéance proposée par l'app (à fréquence
 * identique) ou sur l'ancienne grille, jamais avant son début ; jamais après un arrêt ou une fin.
 */
export function keepsGrid(periods: readonly GridFacts[], opening: Opening): boolean {
  const previous = periods.at(-1)
  if (previous === undefined || previous.stoppedOn !== null) return false
  if (previous.endsOn !== null && previous.endsOn < opening.startsOn) return false
  const origin = originOf(periods)
  if (previous.endsOn !== opening.endsOn || opening.firstDueOn < origin) return false
  const onGrid = (day: Day) => isOnGrid(origin, opening.frequency, day)
  if (continuesGrid(origin, previous, opening)) {
    return !opening.firstDueChosen || onGrid(opening.firstDueOn)
  }
  return (
    sameSteps(previous.frequency, opening.frequency) &&
    (opening.gridOriginOn === null || onGrid(opening.gridOriginOn)) &&
    onGrid(opening.firstDueOn)
  )
}

/** Une période telle qu'on la lit pour sa date de grille. */
export type DatedGrid = GridFacts & {
  id: string
  startsOn: Day
  createdAt: string
  updatedAt?: string
  gridWrittenAt?: string
}

const gridDateOf = (period: DatedGrid) =>
  period.gridWrittenAt ?? period.updatedAt ?? period.createdAt

/**
 * La date de grille héritée de la période précédente quand `opening` en reprend la grille ; `undefined` :
 * la période écrite la date elle-même. Une période ouverte (`reopened` absent) se juge face à toutes ;
 * une période réécrite sur place le jour même de son ouverture, face à celles qui la précèdent.
 */
export function inheritedGridDate(
  periods: readonly DatedGrid[],
  opening: Opening,
  reopened?: { id: string; writtenOn: Day },
): string | undefined {
  const index =
    reopened === undefined ? periods.length : periods.findIndex(({ id }) => id === reopened.id)
  if (reopened !== undefined && (index <= 0 || periods[index]!.startsOn !== reopened.writtenOn)) {
    return undefined
  }
  const earlier = periods.slice(0, index)
  const previous = earlier.at(-1)
  return previous !== undefined && keepsGrid(earlier, opening) ? gridDateOf(previous) : undefined
}
