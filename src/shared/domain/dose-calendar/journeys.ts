import { gridDays, hoursOf, isOnGrid, later, plusDays, sameFrequency } from './grid'
import type { EpisodeLines } from './lines'
import type { Span } from './settings'
import type { Day, Hour, Line, LineEffect, Setting } from './types'

export type Journey = { setting: Setting; hours: Hour[] }

export type JourneyInput = { span: Span; lines: EpisodeLines; reach: Day }

export const sameHours = (a: Setting, b: Setting) =>
  hoursOf(a.times).join() === hoursOf(b.times).join()

/** R3, R6 : les journées de chaque réglage, sur la grille en vigueur, que les décalages font repartir. */
export function journeys(input: JourneyInput, effects: Map<string, LineEffect>) {
  const { span, lines, reach } = input
  const chain = [...span.replaced, ...span.live]
  const days = new Map<Day, Journey>()
  const translated = new Map<Day, string>()
  const boundaries = new Map<Day, Hour[]>()
  const openings = new Set<Day>()
  let grid = { origin: chain[0]!.firstDueOn, floor: '' }
  chain.forEach((setting, position) => {
    const index = position - span.replaced.length
    const end = index < 0 ? setting.startsOn : span.endOf(index)
    const last = [reach, setting.endsOn, end === null ? null : plusDays(end, -1)]
      .filter((day) => day !== null)
      .sort()[0]!
    const previous = chain[position - 1]
    const origin = setting.gridOriginOn
    const earlier = new Set(chain.slice(0, position).map(({ id }) => id))
    const within = ({ dueOn }: Line) => dueOn >= setting.startsOn && (end === null || dueOn < end)
    const anchors = lines.shifts
      .filter((shift) => within(shift) && earlier.has(shift.settingId))
      .map(({ targetOn }) => targetOn!)
    const continued =
      previous !== undefined &&
      sameFrequency(previous.frequency, setting.frequency) &&
      (origin === null ||
        [grid.origin, ...anchors].some((day) => isOnGrid(day, setting.frequency, origin)))
    if (index > 0 && !sameHours(previous!, setting)) {
      translated.set(setting.startsOn, setting.id).set(setting.firstDueOn, setting.id)
    }
    const chosenStart =
      origin !== null &&
      previous !== undefined &&
      previous.firstDueOn >= setting.startsOn &&
      grid.floor === plusDays(previous.firstDueOn, -1)
    const ownFloor = plusDays(later(setting.firstDueOn, setting.startsOn), -1)
    if (index > 0 && !continued && setting.firstDueOn >= setting.startsOn) {
      openings.add(setting.firstDueOn)
    }
    grid = continued
      ? {
          origin: grid.origin,
          floor: chosenStart ? ownFloor : later(grid.floor, plusDays(setting.startsOn, -1)),
        }
      : { origin: origin ?? setting.firstDueOn, floor: ownFloor }
    if (index < 0) return
    // R3 : écrit sous un réglage d'avant un changement de fréquence, un décalage est dépassé.
    const turns = lines.shifts.filter(
      (shift) => within(shift) && (continued || !earlier.has(shift.settingId)),
    )
    let from = setting.startsOn
    for (const turn of [...turns, null]) {
      const to = turn === null || turn.dueOn >= last ? last : turn.dueOn
      for (const day of gridDays(
        grid.origin,
        setting.frequency,
        later(from, plusDays(grid.floor, 1)),
        to,
      )) {
        days.set(day, { setting, hours: hoursOf(setting.times) })
      }
      if (turn === null) break
      effects.set(turn.id, { kind: 'shifts', from: turn.dueOn })
      grid = { origin: turn.targetOn!, floor: later(turn.dueOn, turn.targetOn!) }
      from = plusDays(turn.dueOn, 1)
    }
    if (
      end !== null &&
      end > grid.floor &&
      (setting.endsOn === null || end <= setting.endsOn) &&
      isOnGrid(grid.origin, setting.frequency, end)
    ) {
      boundaries.set(end, [...(boundaries.get(end) ?? []), ...hoursOf(setting.times)])
    }
  })
  for (const shift of lines.shifts) {
    if (!effects.has(shift.id)) effects.set(shift.id, { kind: 'idle', reason: 'overtaken' })
  }
  return { days, translated, boundaries, openings }
}
