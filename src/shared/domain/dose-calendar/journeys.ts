import { gridDays, hoursOf, isOnGrid, later, plusDays, sameFrequency } from './grid'
import type { EpisodeLines } from './lines'
import type { Span } from './settings'
import type { Day, Frequency, Hour, Line, LineEffect, Setting } from './types'

export type Journey = { setting: Setting; hours: Hour[] }

export type JourneyInput = { span: Span; lines: EpisodeLines; reach: Day }

type Segment = { origin: Day; from: Day; to: Day | null }

// `floor` : veille du premier jour que la fiche lit ; `since` : veille de la première échéance.
type Grid = { origin: Day; floor: Day; since: Day }

type Claim = { setting: Setting; end: Day | null; segments: Segment[] }

// R1, R4 : sortie du calendrier, la journée où un réglage cède la place, ou celle d'origine d'un de
// ses reports s'il est remplacé le jour où il commence, se lit avec ce réglage.
function leftDays(claims: readonly Claim[], reports: readonly Line[], stop: Day | null) {
  const left = new Map<Day, Journey>()
  for (const { setting, end, segments } of claims) {
    if (end === null) continue
    const reported = reports
      .filter(({ settingId }) => settingId === setting.id)
      .map(({ dueOn }) => dueOn)
    for (const day of end === setting.startsOn ? [...reported, end] : [end]) {
      const open =
        (setting.endsOn === null || day <= setting.endsOn) && (stop === null || day < stop)
      const wasDay = segments.some(
        (segment) =>
          day >= segment.from &&
          (segment.to === null || day <= segment.to) &&
          isOnGrid(segment.origin, setting.frequency, day),
      )
      if (open && wasDay) left.set(day, { setting, hours: hoursOf(setting.times) })
    }
  }
  return left
}

export const sameHours = (a: Setting, b: Setting) =>
  hoursOf(a.times).join() === hoursOf(b.times).join()

const isDueDay = (grid: Grid, frequency: Frequency, day: Day) =>
  day > grid.since && isOnGrid(grid.origin, frequency, day)

const turned = (turn: Line, chosenFloor: Day): Grid => ({
  origin: turn.targetOn!,
  floor: later(chosenFloor, later(turn.dueOn, turn.targetOn!)),
  since: later(turn.dueOn, turn.targetOn!),
})

/** R3, R6 : les journées de chaque réglage, sur la grille en vigueur, que les décalages font repartir. */
export function journeys(input: JourneyInput, effects: Map<string, LineEffect>) {
  const { span, lines, reach } = input
  const { chain } = span
  const days = new Map<Day, Journey>()
  const translated = new Map<Day, string>()
  const claims: Claim[] = []
  const openings = new Set<Day>()
  let grid: Grid = { origin: chain[0]!.firstDueOn, floor: '', since: '' }
  let rhythm = new Set<string>()
  let rhythmFrom = span.live[0]!.startsOn
  const replaced: { from: Day; to: Day; onDueDay: boolean }[] = []
  let chosenFloor = ''
  let rhythmFloor = ''
  let anchors = new Set<Line>()
  chain.forEach((setting, position) => {
    const index = span.live.indexOf(setting)
    const end = index < 0 ? setting.startsOn : span.endOf(index)
    const last = [reach, setting.endsOn, end === null ? null : plusDays(end, -1)]
      .filter((day) => day !== null)
      .sort()[0]!
    const previous = chain[position - 1]
    const origin = setting.gridOriginOn
    const earlier = new Set(
      span.episode.slice(0, span.episode.indexOf(setting)).map(({ id }) => id),
    )
    const within = ({ dueOn }: Line) => dueOn >= setting.startsOn && (end === null || dueOn < end)
    // R3, R9 : une origine choisie se juge sur la grille en vigueur à la première échéance.
    let inForce = grid
    const held = new Set<Line>()
    for (const shift of lines.shifts) {
      const ahead = shift.dueOn >= setting.startsOn && shift.dueOn < setting.firstDueOn
      if (
        ahead &&
        rhythm.has(shift.settingId) &&
        isDueDay(inForce, setting.frequency, shift.dueOn)
      ) {
        inForce = turned(shift, '')
        held.add(shift)
      }
    }
    const continued =
      previous !== undefined &&
      sameFrequency(previous.frequency, setting.frequency) &&
      (origin === null || isOnGrid(inForce.origin, setting.frequency, origin))
    if (index > 0 && !sameHours(span.live[index - 1]!, setting)) {
      translated.set(setting.startsOn, setting.id).set(setting.firstDueOn, setting.id)
    }
    const ownFloor = plusDays(later(setting.firstDueOn, setting.startsOn), -1)
    if (!continued) {
      for (const day of openings) if (day >= setting.startsOn) openings.delete(day)
      const follows = chain.slice(0, position).some((each) => span.live.includes(each))
      if (follows && setting.firstDueOn >= setting.startsOn) openings.add(setting.firstDueOn)
    }
    // R2, R9 : une origine posée sur la grille en vigueur ne lit aucune journée avant sa première
    // échéance, ni ses suivants de même rythme, pas même après un décalage.
    chosenFloor = !continued ? '' : origin !== null ? ownFloor : chosenFloor
    if (!continued || origin !== null) rhythmFloor = ownFloor
    if (!continued || origin !== null) anchors = continued ? held : new Set()
    rhythm = continued ? new Set([...rhythm, setting.id]) : new Set([setting.id])
    const inherited = grid
    grid = !continued
      ? { origin: origin ?? setting.firstDueOn, floor: ownFloor, since: ownFloor }
      : origin !== null
        ? { ...grid, floor: ownFloor }
        : { ...grid, floor: later(grid.floor, later(chosenFloor, plusDays(setting.startsOn, -1))) }
    if (index < 0) return
    const ended = index > 0 && (span.live[index - 1]!.endsOn ?? setting.startsOn) < setting.startsOn
    // TR-9 : à fréquence gardée, une première échéance choisie remplace la dose du moment du rythme.
    const written = span.episode[span.episode.indexOf(setting) - 1]
    const kept =
      index > 0 &&
      written !== undefined &&
      [written, span.live[index - 1]!].every(({ frequency }) =>
        sameFrequency(frequency, setting.frequency),
      )
    if (kept && origin !== null && !ended) {
      const onDueDay =
        setting.startsOn > inherited.floor &&
        isOnGrid(inherited.origin, setting.frequency, setting.startsOn)
      replaced.push({ from: rhythmFrom, to: setting.startsOn, onDueDay })
    }
    if (index > 0 && (!continued || ended)) rhythmFrom = setting.startsOn
    // R3 : écrit sous un réglage d'avant un changement de fréquence, un décalage est dépassé.
    const turns = lines.shifts.filter(
      (shift) =>
        within(shift) &&
        (!earlier.has(shift.settingId) || (continued && rhythm.has(shift.settingId))),
    )
    let from = setting.startsOn
    const segments: Segment[] = []
    // R6 : un décalage ne vaut que si sa journée d'origine est une échéance de la grille telle qu'elle
    // est avant lui, ou l'arrivée d'une dose reportée du rythme en vigueur ; avant une date choisie,
    // seul celui qui la porte (R3, TR-9).
    const lands = (turn: Line) =>
      (isDueDay(grid, setting.frequency, turn.dueOn) &&
        (turn.dueOn > chosenFloor || anchors.has(turn))) ||
      lines.reports.some((report) => report.targetOn === turn.dueOn && report.dueOn > rhythmFloor)
    for (const turn of [...turns, null]) {
      if (turn !== null && !lands(turn)) continue
      const to = turn === null || turn.dueOn >= last ? last : turn.dueOn
      const start = later(from, plusDays(grid.floor, 1))
      for (const day of gridDays(grid.origin, setting.frequency, start, to)) {
        days.set(day, { setting, hours: hoursOf(setting.times) })
      }
      segments.push({ origin: grid.origin, from: start, to: turn?.dueOn ?? setting.endsOn })
      if (turn === null) break
      effects.set(turn.id, { kind: 'shifts', from: turn.dueOn })
      grid = turned(turn, chosenFloor)
      from = plusDays(turn.dueOn, 1)
    }
    claims.push({ setting, end, segments })
  })
  for (const shift of lines.shifts) {
    if (!effects.has(shift.id)) effects.set(shift.id, { kind: 'idle', reason: 'overtaken' })
  }
  const left = leftDays(claims, lines.reports, span.endOf(span.live.length - 1))
  return { days, translated, left, openings, rhythmFrom, replaced }
}
