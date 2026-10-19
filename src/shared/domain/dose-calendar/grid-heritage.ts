import { isOnGrid, sameFrequency } from './grid'
import type { Day, Setting, SettingFields } from './types'

/** Ce qui fait la grille d'une période, et son arrêt. */
export type GridFacts = Pick<
  Setting,
  'firstDueOn' | 'gridOriginOn' | 'firstDueChosen' | 'frequency' | 'endsOn' | 'stoppedOn'
>

type Opening = Pick<SettingFields, 'startsOn' | Exclude<keyof GridFacts, 'stoppedOn'>>

// R3 : sans origine propre, une période de même fréquence garde la grille de la précédente.
function originOf(periods: readonly GridFacts[]): Day {
  for (let index = periods.length - 1; index > 0; index -= 1) {
    const period = periods[index]!
    if (period.gridOriginOn !== null) return period.gridOriginOn
    if (!sameFrequency(periods[index - 1]!.frequency, period.frequency)) return period.firstDueOn
  }
  return periods[0]!.gridOriginOn ?? periods[0]!.firstDueOn
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
    sameFrequency(previous.frequency, opening.frequency) &&
    previous.endsOn === opening.endsOn &&
    (opening.gridOriginOn === null || isOnGrid(origin, opening.frequency, opening.gridOriginOn)) &&
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
