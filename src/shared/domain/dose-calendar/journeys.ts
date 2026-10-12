import { gridDays, hoursOf, isOnGrid, later, plusDays, sameFrequency } from './grid'
import type { EpisodeLines } from './lines'
import type { Span } from './settings'
import type { Day, Hour, Line, LineEffect, Setting } from './types'

export type Journey = { setting: Setting; hours: Hour[] }

export type JourneyInput = { span: Span; lines: EpisodeLines; reach: Day }

type Segment = { origin: Day; from: Day; to: Day | null }

export const sameHours = (a: Setting, b: Setting) =>
  hoursOf(a.times).join() === hoursOf(b.times).join()

/** R3, R6 : les journées de chaque réglage, sur la grille en vigueur, que les décalages font repartir. */
export function journeys(input: JourneyInput, effects: Map<string, LineEffect>) {
  const { span, lines, reach } = input
  const { chain } = span
  const days = new Map<Day, Journey>()
  const translated = new Map<Day, string>()
  const left = new Map<Day, Journey>()
  const stop = span.endOf(span.live.length - 1)
  const held = new Set([
    ...lines.reports.map(({ dueOn }) => dueOn),
    ...span.live.map((_, index) => span.endOf(index)).filter((day) => day !== null),
  ])
  const openings = new Set<Day>()
  let grid = { origin: chain[0]!.firstDueOn, floor: '' }
  let rhythm = new Set<string>()
  let rhythmFrom = span.live[0]!.startsOn
  let chosenFloor = ''
  chain.forEach((setting, position) => {
    const index = span.live.indexOf(setting)
    const end = index < 0 ? setting.startsOn : span.endOf(index)
    const last = [reach, setting.endsOn, end === null ? null : plusDays(end, -1)]
      .filter((day) => day !== null)
      .sort()[0]!
    const previous = chain[position - 1]
    const origin = setting.gridOriginOn
    const earlier = new Set(chain.slice(0, position).map(({ id }) => id))
    const within = ({ dueOn }: Line) => dueOn >= setting.startsOn && (end === null || dueOn < end)
    // R3, R9 : une origine choisie se juge sur la grille en vigueur à la première échéance.
    const inForce =
      lines.shifts
        .filter(
          ({ dueOn, settingId }) =>
            dueOn >= setting.startsOn && dueOn < setting.firstDueOn && rhythm.has(settingId),
        )
        .at(-1)?.targetOn ?? grid.origin
    const continued =
      previous !== undefined &&
      sameFrequency(previous.frequency, setting.frequency) &&
      (origin === null || isOnGrid(inForce, setting.frequency, origin))
    if (index > 0 && !sameHours(span.live[index - 1]!, setting)) {
      translated.set(setting.startsOn, setting.id).set(setting.firstDueOn, setting.id)
    }
    const chosenStart =
      origin !== null &&
      previous !== undefined &&
      previous.firstDueOn >= setting.startsOn &&
      grid.floor === plusDays(previous.firstDueOn, -1)
    const ownFloor = plusDays(later(setting.firstDueOn, setting.startsOn), -1)
    if (!continued) {
      for (const day of openings) if (day >= setting.startsOn) openings.delete(day)
      const follows = chain.slice(0, position).some((each) => span.live.includes(each))
      if (follows && setting.firstDueOn >= setting.startsOn) openings.add(setting.firstDueOn)
    }
    // R2, R9 : une origine posée sur la grille en vigueur ne lit aucune journée avant sa première
    // échéance, ni ses suivants de même rythme, pas même après un décalage.
    chosenFloor = !continued ? '' : origin !== null ? ownFloor : chosenFloor
    rhythm = continued ? new Set([...rhythm, setting.id]) : new Set([setting.id])
    grid = continued
      ? {
          origin: grid.origin,
          floor: chosenStart
            ? ownFloor
            : later(grid.floor, later(chosenFloor, plusDays(setting.startsOn, -1))),
        }
      : { origin: origin ?? setting.firstDueOn, floor: ownFloor }
    if (index < 0) return
    const ended = index > 0 && (span.live[index - 1]!.endsOn ?? setting.startsOn) < setting.startsOn
    if (index > 0 && (!continued || ended)) rhythmFrom = setting.startsOn
    // R3 : écrit sous un réglage d'avant un changement de fréquence, un décalage est dépassé.
    const turns = lines.shifts.filter(
      (shift) =>
        within(shift) &&
        (!earlier.has(shift.settingId) || (continued && rhythm.has(shift.settingId))),
    )
    let from = setting.startsOn
    const segments: Segment[] = []
    for (const turn of [...turns, null]) {
      const to = turn === null || turn.dueOn >= last ? last : turn.dueOn
      const start = later(from, plusDays(grid.floor, 1))
      for (const day of gridDays(grid.origin, setting.frequency, start, to)) {
        days.set(day, { setting, hours: hoursOf(setting.times) })
      }
      segments.push({ origin: grid.origin, from: start, to: turn?.dueOn ?? setting.endsOn })
      if (turn === null) break
      effects.set(turn.id, { kind: 'shifts', from: turn.dueOn })
      grid = {
        origin: turn.targetOn!,
        floor: later(chosenFloor, later(turn.dueOn, turn.targetOn!)),
      }
      from = plusDays(turn.dueOn, 1)
    }
    // R1, R4 : une journée d'origine d'un report ou de fin de réglage, sortie du calendrier, se lit
    // avec le dernier réglage dont elle était une journée.
    for (const day of held) {
      const wasDay = segments.some(
        (segment) =>
          day >= segment.from &&
          (segment.to === null || day <= segment.to) &&
          isOnGrid(segment.origin, setting.frequency, day),
      )
      const open =
        (setting.endsOn === null || day <= setting.endsOn) && (stop === null || day < stop)
      if (wasDay && open) {
        left.set(day, { setting, hours: hoursOf(setting.times) })
      }
    }
  })
  for (const shift of lines.shifts) {
    if (!effects.has(shift.id)) effects.set(shift.id, { kind: 'idle', reason: 'overtaken' })
  }
  return { days, translated, left, openings, rhythmFrom }
}
