import { continuesGrid, isOnGrid } from './grid'
import type { Day, Setting, SettingFields } from './types'

/** Ce qui fait la grille d'une période, et son arrêt. */
export type GridFacts = Pick<
  Setting,
  'firstDueOn' | 'gridOriginOn' | 'firstDueChosen' | 'frequency' | 'endsOn' | 'stoppedOn'
>

type Opening = Pick<SettingFields, 'startsOn' | Exclude<keyof GridFacts, 'stoppedOn'>>

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
 * La période qui s'ouvre reprend la grille de la dernière sans la changer : même fréquence, même fin,
 * origine vide ou sur l'ancienne grille, première échéance proposée par l'app ou sur l'ancienne
 * grille ; jamais après un arrêt ou une fin.
 */
export function keepsGrid(periods: readonly GridFacts[], opening: Opening): boolean {
  const previous = periods.at(-1)
  if (previous === undefined || previous.stoppedOn !== null) return false
  if (previous.endsOn !== null && previous.endsOn < opening.startsOn) return false
  const origin = originOf(periods)
  return (
    previous.endsOn === opening.endsOn &&
    continuesGrid(origin, previous, opening) &&
    (!opening.firstDueChosen || isOnGrid(origin, opening.frequency, opening.firstDueOn))
  )
}

/** La date de grille d'une période ouverte à `at` : celle de la précédente quand elle en reprend la grille. */
export function openingGridDate(
  settings: readonly Setting[],
  opening: SettingFields,
  at: string,
): string {
  const previous = settings.at(-1)
  if (previous === undefined || !keepsGrid(settings, opening)) return at
  return previous.gridWrittenAt ?? previous.updatedAt ?? previous.createdAt
}
