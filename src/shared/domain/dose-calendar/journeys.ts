import {
  continuesGrid,
  gridDays,
  hoursOf,
  isOnGrid,
  later,
  longestStep,
  plusDays,
  sameFrequency,
  sameHours,
} from './grid'
import { isDueDay, skippedDays, turned, type Grid } from './grid-in-force'
import { touchedWithout, translatedDays, type EpisodeLines } from './lines'
import { shiftKeptByReport } from './rewrite'
import type { Span } from './settings'
import type { Day, Frequency, Hour, Line, LineEffect, Setting } from './types'

export type Journey = { setting: Setting; hours: Hour[] }

/** Journées laissées hors de la grille calculée : aucune ligne ni aucun réglage n'y tombe. */
export type Gap = { after: Day; before: Day }

export type JourneyInput = { span: Span; lines: EpisodeLines; reach: Day; gap?: Gap }

type Segment = { origin: Day; from: Day; to: Day | null }

type Claim = { setting: Setting; end: Day | null; segments: Segment[] }

type Replaced = { from: Day; to: Day; onDueDay: boolean }

// R1, R4 : sortie du calendrier, la journée où un réglage cède la place, ou celle d'origine d'un de
// ses reports s'il est remplacé le jour où il commence, se lit avec ce réglage.
function leftDays(
  claims: readonly Claim[],
  reports: readonly Line[],
  closedFrom: Day | null,
  handed: ReadonlySet<string>,
  journeyOn: (day: Day, setting: Setting) => Journey,
) {
  const left = new Map<Day, Journey>()
  for (const { setting, end, segments } of claims) {
    if (end === null || handed.has(setting.id)) continue
    const reported = reports
      .filter(({ settingId }) => settingId === setting.id)
      .map(({ dueOn }) => dueOn)
    for (const day of end === setting.startsOn ? [...reported, end] : [end]) {
      const open =
        (setting.endsOn === null || day <= setting.endsOn) &&
        (closedFrom === null || day < closedFrom)
      const wasDay = segments.some(
        (segment) =>
          day >= segment.from &&
          (segment.to === null || day <= segment.to) &&
          isOnGrid(segment.origin, setting.frequency, day),
      )
      if (open && wasDay) left.set(day, journeyOn(day, setting))
    }
  }
  return left
}

/** R3, R6 : les journées de chaque réglage, sur la grille en vigueur, que les décalages font repartir. */
export function journeys(input: JourneyInput, effects: Map<string, LineEffect>) {
  const { span, lines, reach, gap } = input
  const { chain } = span
  const days = new Map<Day, Journey>()
  const byId = new Map(span.episode.map((setting) => [setting.id, setting]))
  const translated = translatedDays(span.live, (day) => byId.get(lines.touched.get(day) ?? ''))
  // R4 : hors du jour où les heures changent, une journée touchée garde les heures du réglage de sa
  // ligne la plus récente, celles qu'elle avait quand elle a été touchée.
  const journeyOn = (day: Day, setting: Setting, touchedId = lines.touched.get(day)): Journey => {
    const touched = byId.get(touchedId ?? '')
    const own =
      touched === undefined || translated.has(day) || sameHours(touched, setting)
        ? setting
        : touched
    return { setting: own, hours: hoursOf(own.times) }
  }
  // #883 : la journée de départ d'un report telle qu'elle se lit sans lui.
  const grids = new Map<Day, Setting>()
  const relit = (day: Day, without: Line): Journey | undefined => {
    const setting = grids.get(day)
    return setting && journeyOn(day, setting, touchedWithout(lines, day, without))
  }
  const owns = new Set<string>()
  const keptByReport = (turn: Line) =>
    shiftKeptByReport(turn, {
      reports: lines.reports,
      isDay: (day) => days.has(day),
      settingOf: (id) => byId.get(id)!,
    })
  const claims: Claim[] = []
  const openings = new Set<Day>()
  let grid: Grid = { origin: chain[0]!.firstDueOn, floor: '', since: '' }
  let rhythm = new Set<string>()
  let rhythmFrom = span.live[0]!.startsOn
  const replaced: Replaced[] = []
  // R6, TR-9 : par réglage, la date dont la grille repart, que ses suivants de même rythme continuent.
  const restarts = new Map<string, Day>()
  let restart: Day | undefined
  // R10 : la date choisie seule ; reprise par son remplaçant du jour même, elle lui passe ses journées.
  const chosenRestarts = new Map<string, Day>()
  let chosenRestart: Day | undefined
  let replacing: Replaced | null = null
  // R10, TR-9 : remplacé le jour même par un réglage sans date choisie, un réglage lui laisse ses journées.
  const handed = new Set<string>()
  // R4, #847 : journées de la grille en vigueur qu'une première échéance posée plus loin laisse avant elle.
  const skipped = new Set<Day>()
  let rhythmStartFloor = ''
  let chosenFloor = ''
  let rhythmFloor = ''
  let anchors = new Set<Line>()
  const bounds: (Day | null)[] = []
  let lastGridDay: Day | null = null
  chain.forEach((setting, position) => {
    const index = span.live.indexOf(setting)
    const end = index < 0 ? setting.startsOn : span.endOf(index)
    const unbounded =
      [setting.endsOn, end === null ? null : plusDays(end, -1)]
        .filter((day) => day !== null)
        .sort()[0] ?? null
    const last = unbounded === null || reach < unbounded ? reach : unbounded
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
    const continued = continuesGrid(inForce.origin, previous, setting)
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
    if (!continued || origin !== null) owns.add(setting.id)
    if (!continued) rhythmStartFloor = grid.floor
    const at = span.episode.indexOf(setting)
    const prior = span.live.filter((each) => span.episode.indexOf(each) < at).at(-1)
    const ended = prior !== undefined && (prior.endsOn ?? setting.startsOn) < setting.startsOn
    // R10 : un réglage remplacé le jour même sans prise ne compte pas, d'où qu'il vienne ; la
    // fréquence se compare à celle du réglage en vigueur avant lui.
    const kept = prior !== undefined && sameFrequency(prior.frequency, setting.frequency)
    // TR-9 : à fréquence gardée, une première échéance choisie remplace la dose du moment du rythme,
    // même quand son réglage est remplacé le jour même par un réglage sans date choisie, sauf
    // après « Elles restent à renseigner » (R10, #817, #836).
    const replaces =
      kept && setting.firstDueChosen && setting.fallenDosesAnswer !== 'stay-unlogged' && !ended
    if (replaces) {
      const onDueDay =
        setting.startsOn > inherited.floor &&
        isOnGrid(inherited.origin, setting.frequency, setting.startsOn)
      replacing = { from: rhythmFrom, to: setting.startsOn, onDueDay }
      restart = setting.firstDueOn
      chosenRestart = restart
    } else if (!continued || (origin !== null && setting.firstDueChosen) || ended) {
      replacing = null
      restart = undefined
      chosenRestart = undefined
    } else if (origin !== null) {
      // TR-28 : une origine écrite sans date choisie fait repartir la grille, et le report qui arrive
      // sur sa première échéance, sans remplacer la dose du moment.
      restart = setting.firstDueOn
    }
    if (index < 0) return
    if (replacing !== null) replaced.push(replacing)
    replacing = null
    if (restart !== undefined) restarts.set(setting.id, restart)
    if (chosenRestart !== undefined) chosenRestarts.set(setting.id, chosenRestart)
    if (
      prior?.startsOn === setting.startsOn &&
      (origin === null || !setting.firstDueChosen) &&
      chosenRestart !== undefined &&
      chosenRestarts.get(prior.id) === chosenRestart
    ) {
      handed.add(prior.id)
    }
    if (index > 0 && (ended || !kept || (!continued && replaces))) rhythmFrom = setting.startsOn
    const skip = continued
      ? { from: later(setting.startsOn, plusDays(rhythmStartFloor, 1)), to: grid.floor }
      : null
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
      lines.reports.some(
        (report) => report.targetOn === turn.dueOn && report.dueOn > rhythmFloor,
      ) ||
      keptByReport(turn)
    for (const turn of [...turns, null]) {
      if (turn !== null && !lands(turn)) continue
      const to = turn === null || turn.dueOn >= last ? last : turn.dueOn
      // R4, #847 : les journées laissées avant une date posée plus loin, telles que la fiche les montrait.
      if (skip !== null) {
        const read = later(later(from, skip.from), plusDays(grid.since, 1))
        for (const day of skippedDays(grid, setting.frequency, read, skip.to, to)) skipped.add(day)
      }
      const start = later(from, plusDays(grid.floor, 1))
      for (const day of gridDaysAround(grid.origin, setting.frequency, start, to, gap)) {
        days.set(day, journeyOn(day, setting))
        grids.set(day, setting)
      }
      segments.push({ origin: grid.origin, from: start, to: turn?.dueOn ?? setting.endsOn })
      if (turn === null) {
        lastGridDay =
          unbounded === null
            ? null
            : lastDayOfGrid(grid.origin, setting.frequency, start, unbounded)
        break
      }
      effects.set(turn.id, { kind: 'shifts', from: turn.dueOn })
      grid = turned(turn, chosenFloor)
      rhythmStartFloor = later(turn.dueOn, turn.targetOn!)
      from = plusDays(turn.dueOn, 1)
    }
    claims.push({ setting, end, segments })
    bounds.push(unbounded)
  })
  for (const shift of lines.shifts) {
    if (!effects.has(shift.id)) effects.set(shift.id, { kind: 'idle', reason: 'overtaken' })
  }
  const left = leftDays(claims, lines.reports, span.closedFrom, handed, journeyOn)
  const ends = bounds.filter((day) => day !== null)
  const lastPossibleDay = ends.length < bounds.length ? null : (ends.sort().at(-1) ?? null)
  return {
    days,
    translated,
    left,
    skipped,
    openings,
    rhythmFrom,
    replaced,
    restarts,
    chosenRestarts,
    lastPossibleDay,
    lastGridDay,
    owns,
    relit,
  }
}

function gridDaysAround(origin: Day, frequency: Frequency, from: Day, to: Day, gap?: Gap) {
  if (gap === undefined) return gridDays(origin, frequency, from, to)
  return [
    ...gridDays(origin, frequency, from, to < gap.after ? to : gap.after),
    ...gridDays(origin, frequency, later(from, gap.before), to),
  ]
}

function lastDayOfGrid(origin: Day, frequency: Frequency, from: Day, to: Day): Day | null {
  const window = later(from, plusDays(to, -longestStep(frequency)))
  return gridDays(origin, frequency, window, to).at(-1) ?? null
}
