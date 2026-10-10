import type { ReferenceFrequency, ReferenceLine, ReferenceSetting } from './reference-types'

type Hour = string | null
type Journey = { setting: ReferenceSetting; hours: Hour[] }
type Grid = { origin: string; floor: string }
type Calendar = { pending: string[]; fallen: Set<string> }

const DAY_MS = 86_400_000

const toTime = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
const toDay = (time: number) => new Date(time).toISOString().slice(0, 10)
export const plusDays = (day: string, count: number) => toDay(toTime(day) + count * DAY_MS)
const later = (a: string, b: string) => (a > b ? a : b)
export const keyOf = (day: string, hour: Hour) => (hour === null ? day : `${day} ${hour}`)
const hoursOf = (setting: ReferenceSetting): Hour[] =>
  setting.times.length === 0 ? [null] : [...setting.times].sort()
const sameHours = (a: ReferenceSetting, b: ReferenceSetting) =>
  hoursOf(a).join() === hoursOf(b).join()
export const isNote = (line: ReferenceLine) => line.status === 'given' || line.status === 'missed'
const isMoreRecent = (a: ReferenceLine, b: ReferenceLine) =>
  a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)

function stepped(origin: string, { value, unit }: ReferenceFrequency, step: number): string {
  if (unit !== 'month') return plusDays(origin, step * value * (unit === 'week' ? 7 : 1))
  const months = +origin.slice(5, 7) - 1 + step * value
  const year = +origin.slice(0, 4) + Math.floor(months / 12)
  const month = ((months % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return toDay(Date.UTC(year, month, Math.min(+origin.slice(8, 10), lastDay)))
}

export const longestStep = ({ value, unit }: ReferenceFrequency) =>
  value * (unit === 'month' ? 31 : unit === 'week' ? 7 : 1)

// R2 : l'origine plus un nombre entier de pas, de `from` à `to` inclus.
function gridDays(origin: string, frequency: ReferenceFrequency, from: string, to: string) {
  const longest = longestStep(frequency)
  const days: string[] = []
  let step = Math.floor((toTime(from) - toTime(origin)) / DAY_MS / longest) - 1
  for (
    let day = stepped(origin, frequency, step);
    day <= to;
    day = stepped(origin, frequency, ++step)
  ) {
    if (day >= from) days.push(day)
  }
  return days
}

const sameFrequency = (a: ReferenceSetting, b: ReferenceSetting) =>
  a.frequency.value === b.frequency.value && a.frequency.unit === b.frequency.unit

const isOnGrid = (origin: string, frequency: ReferenceFrequency, day: string) =>
  gridDays(origin, frequency, day, day).length === 1

// R1, R8 : un arrêt clôt un épisode ; la reprise en ouvre un autre.
export function episodesOf(settings: readonly ReferenceSetting[]): ReferenceSetting[][] {
  const ordered = [...settings].sort(
    (a, b) =>
      a.startsOn.localeCompare(b.startsOn) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  )
  const episodes: ReferenceSetting[][] = [[]]
  for (const setting of ordered) {
    episodes.at(-1)!.push(setting)
    if (setting.stoppedOn !== null) episodes.push([])
  }
  return episodes.filter((episode) => episode.length > 0)
}

// TR-25, R11 : une ligne par échéance et par famille, la plus récente ; une journée n'a qu'un report et qu'un décalage.
export function latestBy(lines: ReferenceLine[], keyOfLine: (line: ReferenceLine) => string) {
  const latest = new Map<string, ReferenceLine>()
  for (const line of lines) {
    const kept = latest.get(keyOfLine(line))
    if (kept === undefined || isMoreRecent(line, kept)) latest.set(keyOfLine(line), line)
  }
  return [...latest.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
}

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
  const live = episode.filter(
    (setting, index) =>
      episode[index + 1]?.startsOn !== setting.startsOn ||
      lines.some(
        (line) => line.settingId === setting.id && (isNote(line) || line.status === 'postponed'),
      ),
  )
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
  let grid: Grid = { origin: live[0]!.firstDueOn, floor: '' }
  live.forEach((setting, index) => {
    const end = endOf(index)
    const last = [reach, setting.endsOn, end === null ? null : plusDays(end, -1)]
      .filter((day) => day !== null)
      .sort()[0]!
    // R3 : à fréquence gardée et sur la grille en vigueur, le calendrier continue ; sinon la grille
    // part de la première échéance du réglage (R2).
    const previous = live[index - 1]
    const origin = setting.gridOriginOn
    const anchors = shifts
      .filter(
        ({ dueOn, updatedAt }) =>
          dueOn >= setting.startsOn &&
          (end === null || dueOn < end) &&
          updatedAt < setting.createdAt,
      )
      .map(({ targetOn }) => targetOn!)
    const continued =
      previous !== undefined &&
      sameFrequency(previous, setting) &&
      (origin === null ||
        [grid.origin, ...anchors].some((day) => isOnGrid(day, setting.frequency, origin)))
    if (previous !== undefined && !sameHours(previous, setting)) {
      translated.set(setting.startsOn, setting.id).set(setting.firstDueOn, setting.id)
    }
    grid = continued
      ? { origin: grid.origin, floor: later(grid.floor, plusDays(setting.startsOn, -1)) }
      : {
          origin: setting.gridOriginOn ?? setting.firstDueOn,
          floor: plusDays(later(setting.firstDueOn, setting.startsOn), -1),
        }
    // R6 : à partir de sa journée d'origine, un décalage donne à la grille l'origine de son ancrage ;
    // écrit avant un changement de fréquence, il est dépassé par la nouvelle origine (R3).
    const turns = shifts.filter(
      ({ dueOn, updatedAt }) =>
        dueOn >= setting.startsOn &&
        (end === null || dueOn < end) &&
        (continued || updatedAt > setting.createdAt),
    )
    let from = setting.startsOn
    for (const turn of [...turns, null]) {
      const to = turn === null ? last : turn.dueOn < last ? turn.dueOn : last
      for (const day of gridDays(
        grid.origin,
        setting.frequency,
        later(from, plusDays(grid.floor, 1)),
        to,
      )) {
        days.set(day, { setting, hours: hoursOf(setting) })
      }
      if (turn === null) break
      grid = { origin: turn.targetOn!, floor: later(turn.dueOn, turn.targetOn!) }
      from = plusDays(turn.dueOn, 1)
    }
  })

  // R4 : une prise couvre son échéance ; le jour où les heures changent, celles qui visaient l'ancien
  // réglage couvrent les premières heures du nouveau, à hauteur de leur nombre.
  const coveredOn = (day: string, journey: Journey): Set<Hour> => {
    const ofDay = [...notes, ...borrowed].filter((note) => note.dueOn === day)
    const exact = ofDay.filter(
      (note) =>
        !borrowed.includes(note) &&
        (translated.get(day) !== journey.setting.id || note.settingId === journey.setting.id),
    )
    const covered = new Set(
      journey.hours.filter((hour) => exact.some((note) => note.dueTime === hour)),
    )
    let elsewhere = ofDay.length - exact.length
    for (const hour of journey.hours) {
      if (elsewhere > 0 && !covered.has(hour)) {
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
    const origin = days.get(dueOn)
    const from = origin?.setting ?? settingOf(report!.settingId)
    const hours = origin?.hours ?? hoursOf(from)
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
    day.hours = [
      ...new Set([...day.hours, ...(kept ? moved : hoursOf(arrival).slice(-moved.length))]),
    ].sort()
    days.set(targetOn!, day)
  }

  const pending: string[] = []
  for (const [day, journey] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (journey.hours.length > 0) fallen.add(day)
    const covered = coveredOn(day, journey)
    pending.push(
      ...journey.hours.filter((hour) => !covered.has(hour)).map((hour) => keyOf(day, hour)),
    )
  }
  return { pending, fallen }
}
