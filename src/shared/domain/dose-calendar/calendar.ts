import { gridDays, hoursOf, isOnGrid, keyOf, later, plusDays, sameFrequency, stepped } from './grid'
import type { EpisodeLines } from './lines'
import type { Span } from './settings'
import type { Day, Due, Hour, Line, LineEffect, Setting } from './types'

type Journey = { setting: Setting; hours: Hour[] }

/** Une échéance du calendrier, et la prise qui la couvre ; `exact` : la prise vise cette échéance. */
export type Slot = { due: Due; key: string; coveredBy: Line | null; exact: boolean }

export type EpisodeCalendar = {
  slots: Slot[]
  /** Journées arrivées : celles du calendrier et celles qu'un report a vidées en partant plus tard. */
  fallen: Set<Day>
  /** Échéance retirée par un report → ce report. */
  moved: Map<string, Line>
  effects: Map<string, LineEffect>
}

export type EpisodeInput = {
  settingOf: (id: string) => Setting
  span: Span
  /** Réglages de l'épisode dans l'ordre, ceux remplacés le jour même compris (R10). */
  episode: readonly Setting[]
  lines: EpisodeLines
  /** R8 : prises d'avant l'arrêt qui couvrent la première journée de la reprise. */
  borrowed: readonly Line[]
  /** Dernier jour de la grille calculée. */
  reach: Day
}

const sameHours = (a: Setting, b: Setting) => hoursOf(a.times).join() === hoursOf(b.times).join()

/** R3, R6 : les journées de chaque réglage, sur la grille en vigueur, que les décalages font repartir. */
function journeys(input: EpisodeInput, effects: Map<string, LineEffect>) {
  const { span, episode, lines, reach } = input
  const { live, endOf } = span
  const days = new Map<Day, Journey>()
  const translated = new Map<Day, string>()
  let grid = { origin: live[0]!.firstDueOn, floor: '' }
  live.forEach((setting, index) => {
    const end = endOf(index)
    const last = [reach, setting.endsOn, end === null ? null : plusDays(end, -1)]
      .filter((day) => day !== null)
      .sort()[0]!
    const previous = live[index - 1]
    const origin = setting.gridOriginOn
    const earlier = new Set(episode.slice(0, episode.indexOf(setting)).map(({ id }) => id))
    const within = ({ dueOn }: Line) => dueOn >= setting.startsOn && (end === null || dueOn < end)
    const anchors = lines.shifts
      .filter((shift) => within(shift) && earlier.has(shift.settingId))
      .map(({ targetOn }) => targetOn!)
    const continued =
      previous !== undefined &&
      sameFrequency(previous.frequency, setting.frequency) &&
      (origin === null ||
        [grid.origin, ...anchors].some((day) => isOnGrid(day, setting.frequency, origin)))
    if (previous !== undefined && !sameHours(previous, setting)) {
      translated.set(setting.startsOn, setting.id).set(setting.firstDueOn, setting.id)
    }
    const neverStarted =
      previous !== undefined &&
      previous.firstDueOn >= setting.startsOn &&
      grid.floor === plusDays(previous.firstDueOn, -1)
    const ownFloor = plusDays(later(setting.firstDueOn, setting.startsOn), -1)
    grid = continued
      ? {
          origin: grid.origin,
          floor: neverStarted ? ownFloor : later(grid.floor, plusDays(setting.startsOn, -1)),
        }
      : { origin: origin ?? setting.firstDueOn, floor: ownFloor }
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
  })
  for (const shift of lines.shifts) {
    if (!effects.has(shift.id)) effects.set(shift.id, { kind: 'idle', reason: 'overtaken' })
  }
  return { days, translated }
}

/** R4, R7, R11 : le calendrier d'un épisode, une passe par étape, du réglage à la couverture. */
export function episodeCalendar(input: EpisodeInput): EpisodeCalendar {
  const { settingOf, span, lines, borrowed } = input
  const effects = new Map<string, LineEffect>()
  const { days, translated } = journeys(input, effects)
  const byDay = new Map<Day, Line[]>()
  for (const note of [...lines.notes, ...borrowed]) {
    byDay.set(note.dueOn, [...(byDay.get(note.dueOn) ?? []), note])
  }
  const isBorrowed = new Set(borrowed)
  const noted = new Set(
    [...lines.notes, ...borrowed].map((note) => keyOf(note.dueOn, note.dueTime)),
  )
  const matched = new Set<Line>()
  const heldAtOrigin = new Set<Line>()

  // R4 : une prise couvre son échéance ; le jour où les heures changent, celles qui visaient
  // l'ancien réglage couvrent les premières heures du nouveau, à hauteur de leur nombre.
  const coveredOn = (day: Day, journey: Journey): Map<Hour, Line> => {
    const ofDay = byDay.get(day) ?? []
    const exact = ofDay.filter(
      (note) =>
        !isBorrowed.has(note) &&
        (translated.get(day) !== journey.setting.id || note.settingId === journey.setting.id),
    )
    for (const note of ofDay) {
      if (!exact.includes(note) || journey.hours.includes(note.dueTime)) matched.add(note)
    }
    const covered = new Map<Hour, Line>()
    for (const hour of journey.hours) {
      const note = exact.find(({ dueTime }) => dueTime === hour)
      if (note !== undefined) covered.set(hour, note)
    }
    const elsewhere = ofDay.filter((note) => !exact.includes(note))
    for (const hour of journey.hours) {
      if (elsewhere.length > 0 && !covered.has(hour)) covered.set(hour, elsewhere.shift()!)
    }
    return covered
  }

  // R7 : un report emporte son heure et les suivantes encore sans prise ; les reports qui arrivent
  // sur sa journée passent d'abord.
  const fallen = new Set<Day>()
  const moved = new Map<string, Line>()
  const waiting = [...lines.reports]
  while (waiting.length > 0) {
    const ready = waiting.findIndex(
      (report) => !waiting.some((other) => other.targetOn === report.dueOn),
    )
    const report = waiting.splice(Math.max(0, ready), 1)[0]!
    const { dueOn, dueTime, targetOn } = report
    const origin = days.get(dueOn)
    const from = origin?.setting ?? settingOf(report.settingId)
    const hours = origin?.hours ?? hoursOf(from.times)
    if (origin === undefined) {
      for (const note of byDay.get(dueOn) ?? []) {
        if (!isBorrowed.has(note) && hours.includes(note.dueTime)) {
          matched.add(note)
          heldAtOrigin.add(note)
        }
      }
    }
    const covered =
      origin === undefined
        ? new Set(hours.filter((hour) => noted.has(keyOf(dueOn, hour))))
        : new Set(coveredOn(dueOn, origin).keys())
    if (covered.has(dueTime)) {
      effects.set(report.id, { kind: 'idle', reason: 'beaten' })
      continue
    }
    if (targetOn! > dueOn) fallen.add(dueOn)
    const leaving = hours.filter((hour) => (hour ?? '') >= (dueTime ?? '') && !covered.has(hour))
    if (origin !== undefined) origin.hours = origin.hours.filter((hour) => !leaving.includes(hour))
    leaving.forEach((hour) => moved.set(keyOf(dueOn, hour), report))
    const arrival = span.settingAt(targetOn!)
    const keys = leaving.map((hour) => keyOf(dueOn, hour))
    if (leaving.length === 0) {
      effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
      continue
    }
    effects.set(report.id, {
      kind: 'moves',
      keys,
      arrival: arrival === undefined ? null : targetOn,
    })
    if (arrival === undefined) continue
    // R7 : heures changées, le jour d'arrivée prend autant de dernières heures que de doses reportées.
    const kept = sameHours(arrival, from)
    if (!kept) translated.set(targetOn!, arrival.id)
    const day = days.get(targetOn!) ?? { setting: arrival, hours: [] }
    const arriving = kept ? leaving : hoursOf(arrival.times).slice(-leaving.length)
    day.hours = [...new Set([...day.hours, ...arriving])].sort()
    days.set(targetOn!, day)
  }

  const slots: Slot[] = []
  for (const [day, journey] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (journey.hours.length > 0) fallen.add(day)
    const covered = coveredOn(day, journey)
    for (const hour of journey.hours) {
      const note = covered.get(hour) ?? null
      const exact =
        note !== null && note.dueTime === hour && note.dueOn === day && !isBorrowed.has(note)
      const due = { settingId: journey.setting.id, dueOn: day, dueTime: hour }
      slots.push({ due, key: keyOf(day, hour), coveredBy: note, exact })
    }
  }
  coverOrphans(lines.notes, matched, slots, settingOf)
  noteEffects(lines, slots, heldAtOrigin, effects)
  return { slots, fallen, moved, effects }
}

// R4 : une prise dont l'échéance a quitté le calendrier couvre la première échéance qui suit, à
// moins d'un pas de son réglage ; déjà couverte ou trop loin, la prise est sans effet.
function coverOrphans(
  notes: readonly Line[],
  matched: ReadonlySet<Line>,
  slots: Slot[],
  settingOf: (id: string) => Setting,
): void {
  const orphans = notes
    .filter((note) => !matched.has(note))
    .sort((a, b) => keyOf(a.dueOn, a.dueTime).localeCompare(keyOf(b.dueOn, b.dueTime)))
  for (const note of orphans) {
    const own = keyOf(note.dueOn, note.dueTime)
    const slot = slots.find(({ key }) => key > own)
    const limit = stepped(note.dueOn, settingOf(note.settingId).frequency, 1)
    if (slot !== undefined && slot.coveredBy === null && slot.due.dueOn < limit) {
      slot.coveredBy = note
    }
  }
}

function noteEffects(
  lines: EpisodeLines,
  slots: readonly Slot[],
  heldAtOrigin: ReadonlySet<Line>,
  effects: Map<string, LineEffect>,
): void {
  const covering = new Map<Line, string>()
  for (const { coveredBy, key } of slots) {
    if (coveredBy !== null && !covering.has(coveredBy)) covering.set(coveredBy, key)
  }
  for (const note of lines.notes) {
    const key = covering.get(note)
    const own = heldAtOrigin.has(note) ? keyOf(note.dueOn, note.dueTime) : undefined
    const covered = key ?? own
    effects.set(
      note.id,
      covered === undefined
        ? { kind: 'idle', reason: 'nothing-to-cover' }
        : { kind: 'covers', key: covered },
    )
  }
  for (const line of lines.kept) {
    if (line.status === 'extra') effects.set(line.id, { kind: 'extra' })
  }
  lines.idle.forEach((reason, id) => effects.set(id, { kind: 'idle', reason }))
}
