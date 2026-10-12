import {
  gridDays,
  hoursOf,
  isOnGrid,
  keyOf,
  later,
  plusDays,
  sameFrequency,
  sameHours,
  type Hour,
} from './reference-grid'
import {
  coverOrphans,
  leftDays,
  type Claim,
  type Journey,
  type ReferenceDue,
  type Segment,
} from './reference-days'
import { isNote, latestBy } from './reference-lines'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

type Grid = { origin: string; floor: string }
type Calendar = { pending: string[]; fallen: Set<string>; rhythmFrom: string }

export function calendarOf(
  settings: readonly ReferenceSetting[],
  episode: ReferenceSetting[],
  allLines: readonly ReferenceLine[],
  borrowed: ReferenceLine[],
  reach: string,
): Calendar {
  const ids = new Set(episode.map(({ id }) => id))
  const lines = latestBy(
    allLines.filter((line) => ids.has(line.settingId)),
    (line) =>
      `${line.settingId} ${keyOf(line.dueOn, line.dueTime)} ${isNote(line) ? 'note' : line.status}`,
  )
  // R10 : remplacé le jour même, un réglage encore sans prise n'a jamais existé.
  const isLive = (setting: ReferenceSetting, index: number) =>
    episode[index + 1]?.startsOn !== setting.startsOn ||
    lines.some(
      (line) => line.settingId === setting.id && (isNote(line) || line.status === 'postponed'),
    )
  const live = episode.filter(isLive)
  const notes = lines.filter(isNote)
  const noted = new Set([...notes, ...borrowed].map((note) => keyOf(note.dueOn, note.dueTime)))
  const shifts = latestBy(
    lines.filter((line) => line.status === 'shift' && line.targetOn !== null),
    (line) => line.dueOn,
  )
  const reports = latestBy(
    lines.filter(
      (line) =>
        line.status === 'postponed' && line.targetOn !== null && line.targetOn !== line.dueOn,
    ),
    (line) => line.dueOn,
  )
  const settingOf = (id: string) => settings.find((setting) => setting.id === id)!
  const endOf = (index: number) => live[index + 1]?.startsOn ?? live[index]!.stoppedOn
  const settingAt = (day: string) => {
    const index = live.filter(({ startsOn }) => startsOn <= day).length - 1
    const setting = live[index]
    if (setting === undefined) return undefined
    const end = endOf(index)
    const open = (end === null || day < end) && (setting.endsOn === null || day <= setting.endsOn)
    return open ? setting : undefined
  }

  const days = new Map<string, Journey>()
  // R4, R7, R9 : les jours où une prise visant d'autres heures couvre les premières heures.
  const translated = new Map<string, string>()
  const left = new Map<string, Journey>()
  const claims: Claim[] = []
  const stop = endOf(live.length - 1)
  // R7, R9.2 : les premières échéances des réglages qui ouvrent un nouveau rythme.
  const openings = new Set<string>()
  // R3, R10 : remplacé le jour même, un réglage transmet sa grille au suivant de même fréquence.
  const chain = episode.filter(
    (setting, index) => isLive(setting, index) || sameFrequency(setting, episode[index + 1]!),
  )
  let grid: Grid = { origin: chain[0]!.firstDueOn, floor: '' }
  // R9, Q-retard : les réglages de même fréquence continuent le rythme, et sa dose en retard.
  let rhythm = new Set<string>()
  let rhythmFrom = live[0]!.startsOn
  const replaced: { from: string; to: string }[] = []
  let chosenFloor = ''
  let restartFloor = ''
  let anchorShift: ReferenceLine | undefined
  chain.forEach((setting, position) => {
    const index = live.indexOf(setting)
    const end = index < 0 ? setting.startsOn : endOf(index)
    const last = [reach, setting.endsOn, end === null ? null : plusDays(end, -1)]
      .filter((day) => day !== null)
      .sort()[0]!
    // R3 : à fréquence gardée et sur la grille en vigueur, le calendrier continue ; sinon la grille
    // part de la première échéance du réglage (R2).
    const previous = chain[position - 1]
    const origin = setting.gridOriginOn
    const earlier = new Set(episode.slice(0, episode.indexOf(setting)).map(({ id }) => id))
    const within = ({ dueOn }: ReferenceLine) =>
      dueOn >= setting.startsOn && (end === null || dueOn < end)
    // R3, R9 : une origine choisie se juge sur la grille en vigueur à la première échéance.
    const held = shifts
      .filter(
        ({ dueOn, settingId }) =>
          dueOn >= setting.startsOn && dueOn < setting.firstDueOn && rhythm.has(settingId),
      )
      .at(-1)
    const inForce = held?.targetOn ?? grid.origin
    const continued =
      previous !== undefined &&
      sameFrequency(previous, setting) &&
      (origin === null || isOnGrid(inForce, setting.frequency, origin))
    if (index > 0 && !sameHours(live[index - 1]!, setting)) {
      translated.set(setting.startsOn, setting.id).set(setting.firstDueOn, setting.id)
    }
    // R3 : une première échéance choisie sur la grille d'un réglage jamais commencé la fait partir
    // d'elle ; héritée, elle garde la grille du réglage remplacé (décision du 2026-10-11).
    const chosenStart =
      origin !== null &&
      previous !== undefined &&
      previous.firstDueOn >= setting.startsOn &&
      grid.floor === plusDays(previous.firstDueOn, -1)
    const ownFloor = plusDays(later(setting.firstDueOn, setting.startsOn), -1)
    if (!continued) {
      for (const day of openings) if (day >= setting.startsOn) openings.delete(day)
      const follows = chain.slice(0, position).some((each) => live.includes(each))
      if (follows && setting.firstDueOn >= setting.startsOn) openings.add(setting.firstDueOn)
    }
    // R2, R9 : une origine posée sur la grille en vigueur ne lit aucune journée avant sa première
    // échéance, ni ses suivants de même rythme, pas même après un décalage.
    chosenFloor = !continued ? '' : origin !== null ? ownFloor : chosenFloor
    // R6, R11 : un décalage d'avant la première échéance d'un réglage qui fait repartir la grille est
    // sans effet, sauf sur l'arrivée d'un report ou sous la date choisie qu'il a portée (R3).
    if (!continued || origin !== null) restartFloor = ownFloor
    if (!continued || origin !== null) anchorShift = continued ? held : undefined
    rhythm = continued ? new Set([...rhythm, setting.id]) : new Set([setting.id])
    grid = continued
      ? {
          origin: grid.origin,
          floor: chosenStart
            ? ownFloor
            : later(grid.floor, later(chosenFloor, plusDays(setting.startsOn, -1))),
        }
      : { origin: setting.gridOriginOn ?? setting.firstDueOn, floor: ownFloor }
    if (index < 0) return
    const ended = index > 0 && (live[index - 1]!.endsOn ?? setting.startsOn) < setting.startsOn
    // TR-9 : à fréquence gardée, une première échéance choisie remplace la dose en retard du rythme.
    const written = episode[episode.indexOf(setting) - 1]
    const kept =
      index > 0 &&
      written !== undefined &&
      [written, live[index - 1]!].every((other) => sameFrequency(other, setting))
    if (kept && origin !== null && !ended) replaced.push({ from: rhythmFrom, to: setting.startsOn })
    if (index > 0 && (!continued || ended)) rhythmFrom = setting.startsOn
    // R6 : à partir de sa journée d'origine, un décalage donne à la grille l'origine de son ancrage ;
    // écrit sous un réglage d'avant un changement de fréquence, il est dépassé par la nouvelle origine (R3).
    const turns = shifts.filter(
      (shift) =>
        within(shift) &&
        (!earlier.has(shift.settingId) || (continued && rhythm.has(shift.settingId))),
    )
    let from = setting.startsOn
    const segments: Segment[] = []
    for (const turn of [...turns, null]) {
      const lands =
        turn === null ||
        turn === anchorShift ||
        turn.dueOn > restartFloor ||
        reports.some(({ targetOn }) => targetOn === turn.dueOn)
      if (!lands) continue
      const to = turn === null ? last : turn.dueOn < last ? turn.dueOn : last
      const start = later(from, plusDays(grid.floor, 1))
      for (const day of gridDays(grid.origin, setting.frequency, start, to)) {
        days.set(day, { setting, hours: hoursOf(setting) })
      }
      segments.push({ origin: grid.origin, from: start, to: turn?.dueOn ?? setting.endsOn })
      if (turn === null) break
      grid = {
        origin: turn.targetOn!,
        floor: later(chosenFloor, later(turn.dueOn, turn.targetOn!)),
      }
      from = plusDays(turn.dueOn, 1)
    }
    claims.push({ setting, end, segments })
  })

  leftDays(claims, reports, stop).forEach((journey, day) => left.set(day, journey))

  // R4 : une prise couvre son échéance ; le jour où les heures changent, celles qui visaient l'ancien
  // réglage couvrent les premières heures du nouveau, à hauteur de leur nombre.
  const matched = new Set<ReferenceLine>()
  const coveredOn = (day: string, journey: Journey): Set<Hour> => {
    const ofDay = [...notes, ...borrowed].filter((note) => note.dueOn === day)
    const exact = ofDay.filter(
      (note) =>
        !borrowed.includes(note) &&
        (!translated.has(day) || sameHours(settingOf(note.settingId), journey.setting)),
    )
    ofDay
      .filter((note) => !exact.includes(note) || journey.hours.includes(note.dueTime))
      .forEach((note) => matched.add(note))
    const covered = new Set(
      journey.hours.filter((hour) => exact.some((note) => note.dueTime === hour)),
    )
    // R4 : une journée de l'ancien réglage entièrement notée n'a plus rien à donner.
    const whole = ofDay.some(
      (note) =>
        !exact.includes(note) &&
        !borrowed.includes(note) &&
        hoursOf(settingOf(note.settingId)).every((hour) =>
          ofDay.some((other) => other.settingId === note.settingId && other.dueTime === hour),
        ),
    )
    let elsewhere = ofDay.length - exact.length
    for (const hour of journey.hours) {
      if ((elsewhere > 0 || whole) && !covered.has(hour)) {
        covered.add(hour)
        elsewhere -= 1
      }
    }
    return covered
  }

  // R7 : un report emporte son heure et les suivantes encore sans prise ; les reports qui arrivent sur
  // sa journée passent d'abord.
  const fallen = new Set<string>()
  const waiting = [...reports]
  while (waiting.length > 0) {
    const ready = waiting.findIndex(
      (report) => !waiting.some((other) => other.targetOn === report.dueOn),
    )
    const [report] = waiting.splice(Math.max(0, ready), 1)
    const { dueOn, dueTime, targetOn } = report!
    const origin = days.get(dueOn) ?? left.get(dueOn)
    const from = origin?.setting ?? settingOf(report!.settingId)
    const hours = origin?.hours ?? hoursOf(from)
    if (origin === undefined) {
      notes
        .filter((note) => note.dueOn === dueOn && hours.includes(note.dueTime))
        .forEach((note) => matched.add(note))
    }
    const covered =
      origin === undefined
        ? new Set(hours.filter((hour) => noted.has(keyOf(dueOn, hour))))
        : coveredOn(dueOn, origin)
    // R11 : un report battu par une prise de la même échéance est sans effet.
    if (covered.has(dueTime)) continue
    if (targetOn! > dueOn) fallen.add(dueOn)
    const moved = hours.filter((hour) => (hour ?? '') >= (dueTime ?? '') && !covered.has(hour))
    if (origin !== undefined) origin.hours = origin.hours.filter((hour) => !moved.includes(hour))
    const arrival = settingAt(targetOn!)
    if (arrival === undefined || moved.length === 0) continue
    // R7 : heures changées, le jour d'arrivée prend autant de dernières heures que de doses reportées.
    const kept = sameHours(arrival, from)
    if (!kept) translated.set(targetOn!, arrival.id)
    const day = days.get(targetOn!) ?? { setting: arrival, hours: [] }
    // R7, R9.2 : un nouveau rythme qui part du jour d'arrivée d'un report lui laisse ses seules heures.
    if (openings.delete(targetOn!)) day.hours = []
    day.hours = [
      ...new Set([...day.hours, ...(kept ? moved : hoursOf(arrival).slice(-moved.length))]),
    ].sort()
    days.set(targetOn!, day)
  }

  left.forEach((journey, day) => {
    if (!days.has(day)) coveredOn(day, journey)
  })

  const dues: ReferenceDue[] = []
  for (const [day, journey] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (journey.hours.length > 0) fallen.add(day)
    const covered = coveredOn(day, journey)
    dues.push(
      ...journey.hours.map((hour) => ({ key: keyOf(day, hour), day, covered: covered.has(hour) })),
    )
  }
  coverOrphans(notes, matched, dues, settingOf)
  const lateDays = replaced.map(({ from, to }) =>
    [...fallen]
      .filter((day) => day >= from && day < to)
      .sort()
      .at(-1),
  )
  const pending = dues
    .filter(({ covered, day }) => !covered && !lateDays.includes(day))
    .map(({ key }) => key)
  return { pending, fallen, rhythmFrom }
}
