import { gridDays, isOnGrid, later } from './grid'
import type { Day, Frequency, Line } from './types'

/** La grille en vigueur ; `floor` : veille du premier jour que la fiche lit ; `since` : veille de la première échéance. */
export type Grid = { origin: Day; floor: Day; since: Day }

export const isDueDay = (grid: Grid, frequency: Frequency, day: Day): boolean =>
  day > grid.since && isOnGrid(grid.origin, frequency, day)

/** R6 : à partir de sa journée d'origine, un décalage donne à la grille l'origine de son ancrage. */
export const turned = (turn: Line, chosenFloor: Day): Grid => ({
  origin: turn.targetOn!,
  floor: later(chosenFloor, later(turn.dueOn, turn.targetOn!)),
  since: later(turn.dueOn, turn.targetOn!),
})

/**
 * R4, #847 : les journées de la grille en vigueur, à partir de `read`, qu'une première échéance posée
 * plus loin laisse avant elle, jusqu'à `floor` et au plus tard `last`.
 */
export function skippedDays(
  grid: Grid,
  frequency: Frequency,
  read: Day,
  floor: Day,
  last: Day,
): Day[] {
  return gridDays(grid.origin, frequency, read, floor < last ? floor : last)
}
