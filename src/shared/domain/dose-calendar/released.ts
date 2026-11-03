import { isOnGrid, sameFrequency } from './grid'
import { latestBy } from './latest'
import type { Span } from './settings'
import type { Day, Line, LineEffect, Setting } from './types'

/** La clé d'une prise : l'échéance qu'elle couvre, ou le jour et l'heure où elle a été donnée (#1373). */
export const takenKeyOf = (effect: LineEffect): string | null =>
  effect.kind === 'covers' || effect.kind === 'old-rhythm' ? effect.key : null

/** Une prise donnée avant le jour de son échéance. */
export const givenAhead = (line: Pick<Line, 'status' | 'givenOn' | 'dueOn'>): boolean =>
  line.status === 'given' && line.givenOn !== null && line.givenOn < line.dueOn

const advancedTo = (line: Line): Day | null =>
  line.targetOn !== null && line.targetOn < line.dueOn ? line.targetOn : null

// R3 : le rythme d'un jour, du réglage qui a changé la fréquence à celui en vigueur ; sa grille est
// celle du dernier qui l'a fait repartir.
function rhythmAt(span: Span, day: Day): { opener: Setting; grid: Setting } | undefined {
  const inForce = span.settingAt(day)
  if (inForce === undefined) return undefined
  const index = span.live.indexOf(inForce)
  let start = index
  while (start > 0 && sameFrequency(span.live[start - 1]!.frequency, inForce.frequency)) start -= 1
  const run = span.live.slice(start, index + 1)
  const grid = [...run].reverse().find(({ gridOriginOn }) => gridOriginOn !== null) ?? run[0]!
  return { opener: run[0]!, grid }
}

// #741 : une journée de l'ancien rythme seule (arrivée d'un report) garde ses prises.
const onGrid = (setting: Setting, day: Day): boolean =>
  day >= setting.firstDueOn &&
  isOnGrid(setting.gridOriginOn ?? setting.firstDueOn, setting.frequency, day)

function takenOnArrival(report: Line, lines: readonly Line[]): boolean {
  const arrival = report.status === 'postponed' ? advancedTo(report) : null
  return arrival !== null && lines.some((line) => line.status === 'given' && line.dueOn === arrival)
}

/**
 * R4, R6 (#1373, Q76) : écrites avant un réglage d'une autre fréquence, les lignes d'une journée
 * avancée avec la case restent à l'ancien rythme.
 */
export function releasedLines(lines: readonly Line[], span: Span): Set<Line> {
  const settingOf = (id: string) => span.episode.find((setting) => setting.id === id)
  const before = (line: Line, opener: Setting) => line.decidedAt < opener.createdAt
  const shifts = lines.filter((line) => {
    const rhythm = line.status === 'shift' ? rhythmAt(span, line.dueOn) : undefined
    return rhythm !== undefined && line.targetOn !== null && before(line, rhythm.opener)
  })
  const released = new Set<Line>()
  for (const shift of latestBy(shifts, (line) => line.dueOn)) {
    const anchor = advancedTo(shift)
    const { opener, grid } = rhythmAt(span, shift.dueOn)!
    if (anchor === null || anchor > opener.startsOn || !onGrid(grid, shift.dueOn)) continue
    if (sameFrequency(settingOf(shift.settingId)!.frequency, opener.frequency)) continue
    released.add(shift)
    for (const line of lines) {
      if (line.dueOn !== shift.dueOn || !before(line, opener)) continue
      if (givenAhead(line) || takenOnArrival(line, lines)) released.add(line)
    }
  }
  return released
}
