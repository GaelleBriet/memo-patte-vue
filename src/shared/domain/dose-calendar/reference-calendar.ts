import {
  gridDays,
  hoursOf,
  type Hour,
  isOnGrid,
  keyOf,
  later,
  plusDays,
  sameFrequency,
  sameHours,
} from './reference-grid'
import {
  coverageOf,
  coverOrphans,
  lateDaysOf,
  handedOf,
  leftDays,
  stopDayOf,
  type Claim,
  type Journey,
  type ReferenceDue,
  type Replaced,
  type Segment,
} from './reference-days'
import {
  episodeLinesOf,
  isLiveIn,
  isNote,
  latestBy,
  reportsOf,
  touchedJourneys,
  translatedDaysOf,
} from './reference-lines'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

type Grid = { origin: string; floor: string; since: string }
type Calendar = { pending: string[]; fallen: Set<string>; rhythmFrom: string }

export function calendarOf(
  settings: readonly ReferenceSetting[],
  episode: ReferenceSetting[],
  allLines: readonly ReferenceLine[],
  borrowed: ReferenceLine[],
  reach: string,
): Calendar {
  const isLive = isLiveIn(episode, allLines)
  const live = episode.filter(isLive)
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
  const { closedFrom, stoppedAt } = stopDayOf(live.at(-1)!)
  const lines = episodeLinesOf(episode, live, allLines)
  const notes = lines.filter(isNote)
  const noted = new Set([...notes, ...borrowed].map((note) => keyOf(note.dueOn, note.dueTime)))
  const shifts = latestBy(
    lines.filter((line) => line.status === 'shift' && line.targetOn !== null),
    (line) => line.dueOn,
  )
  const reports = reportsOf(lines)

  const days = new Map<string, Journey>()
  const translated = translatedDaysOf(live)
  const journeyOn = touchedJourneys([...notes, ...reports], translated, settingOf)
  const left = new Map<string, Journey>()
  const claims: Claim[] = []
  // R7, R9.2 : les premières échéances des réglages qui ouvrent un nouveau rythme.
  const openings = new Set<string>()
  // R3, R10 : remplacé le jour même, un réglage transmet sa grille au suivant de même fréquence.
  const chain = episode.filter(
    (setting, index) => isLive(setting, index) || sameFrequency(setting, episode[index + 1]!),
  )
  let grid: Grid = { origin: chain[0]!.firstDueOn, floor: '', since: '' }
  // R9, Q-retard : les réglages de même fréquence continuent le rythme, et sa dose en retard.
  let rhythm = new Set<string>()
  let rhythmFrom = live[0]!.startsOn
  const replaced: Replaced[] = []
  const restarts = new Map<string, string>()
  let restart: string | undefined
  // R10 : la date choisie seule ; reprise par son remplaçant du jour même, elle lui passe ses journées.
  const chosenRestarts = new Map<string, string>()
  let chosenRestart: string | undefined
  let waitingReplace: Replaced | undefined
  let chosenFloor = ''
  let rhythmFloor = ''
  let anchors = new Set<ReferenceLine>()
  const isDueDay = (on: Grid, setting: ReferenceSetting, day: string) =>
    day > on.since && isOnGrid(on.origin, setting.frequency, day)
  const turned = (turn: ReferenceLine, floor: string): Grid => ({
    origin: turn.targetOn!,
    floor: later(floor, later(turn.dueOn, turn.targetOn!)),
    since: later(turn.dueOn, turn.targetOn!),
  })
  chain.forEach((setting, position) => {
    const index = live.indexOf(setting)
    const end = index < 0 ? setting.startsOn : endOf(index)
    const last = [reach, setting.endsOn, end === null ? null : plusDays(end, -1)]
      .filter((day) => day !== null)
      .sort()[0]!
    // R3 : à fréquence gardée et sur la grille en vigueur, le calendrier continue ; sinon, R2.
    const previous = chain[position - 1]
    const origin = setting.gridOriginOn
    const earlier = new Set(episode.slice(0, episode.indexOf(setting)).map(({ id }) => id))
    const within = ({ dueOn }: ReferenceLine) =>
      dueOn >= setting.startsOn && (end === null || dueOn < end)
    // R3, R9 : une origine choisie se juge sur la grille en vigueur à la première échéance.
    const held = new Set<ReferenceLine>()
    const inForce = shifts
      .filter(
        ({ dueOn, settingId }) =>
          dueOn >= setting.startsOn && dueOn < setting.firstDueOn && rhythm.has(settingId),
      )
      .reduce((on, shift) => {
        if (!isDueDay(on, setting, shift.dueOn)) return on
        held.add(shift)
        return turned(shift, '')
      }, grid)
    const continued =
      previous !== undefined &&
      sameFrequency(previous, setting) &&
      (origin === null || isOnGrid(inForce.origin, setting.frequency, origin))
    const ownFloor = plusDays(later(setting.firstDueOn, setting.startsOn), -1)
    if (!continued) {
      for (const day of openings) if (day >= setting.startsOn) openings.delete(day)
      const follows = chain.slice(0, position).some((each) => live.includes(each))
      if (follows && setting.firstDueOn >= setting.startsOn) openings.add(setting.firstDueOn)
    }
    // R2, R9 : une origine sur la grille en vigueur, ni ses suivants, ne lit rien avant elle.
    chosenFloor = !continued ? '' : origin !== null ? ownFloor : chosenFloor
    if (!continued || origin !== null) rhythmFloor = ownFloor
    if (!continued || origin !== null) anchors = continued ? held : new Set()
    rhythm = continued ? new Set([...rhythm, setting.id]) : new Set([setting.id])
    const inherited = grid
    // R3, TR-9 : une première échéance choisie est lue, même plus tôt que celle du réglage hérité.
    grid = !continued
      ? { origin: setting.gridOriginOn ?? setting.firstDueOn, floor: ownFloor, since: ownFloor }
      : origin !== null
        ? { ...grid, floor: ownFloor }
        : { ...grid, floor: later(grid.floor, later(chosenFloor, plusDays(setting.startsOn, -1))) }
    const livesBefore = live.filter((other) => episode.indexOf(other) < episode.indexOf(setting))
    const lastLive = livesBefore[livesBefore.length - 1]
    const ended = lastLive !== undefined && (lastLive.endsOn ?? setting.startsOn) < setting.startsOn
    // R10 : la fréquence se compare au réglage d'avant celui remplacé le jour même sans prise.
    const kept = lastLive !== undefined && sameFrequency(lastLive, setting)
    // R10, #817, #836 : seule une date choisie sans « Elles restent à renseigner » remplace la dose
    // du moment ; une date proposée ou gardée à renseigner laisse le rythme et sa dose en retard.
    const replaces = kept && setting.firstDueChosen && !setting.pastDosesStayUnlogged && !ended
    if (replaces) {
      const onDueDay =
        setting.startsOn > inherited.floor &&
        isOnGrid(inherited.origin, setting.frequency, setting.startsOn)
      waitingReplace = { from: rhythmFrom, to: setting.startsOn, onDueDay }
      // R6, TR-9 : la grille repartie d'une date choisie, continuée par les réglages de même rythme.
      restart = setting.firstDueOn
      chosenRestart = restart
    } else if (!continued || (origin !== null && setting.firstDueChosen) || ended) {
      waitingReplace = undefined
      restart = undefined
      chosenRestart = undefined
    } else if (origin !== null) {
      // TR-28 : une origine écrite sans date choisie fait repartir la grille, et le report qui arrive
      // sur sa première échéance, sans remplacer la dose du moment.
      restart = setting.firstDueOn
    }
    if (index < 0) return
    if (waitingReplace !== undefined) replaced.push(waitingReplace)
    waitingReplace = undefined
    if (restart !== undefined) restarts.set(setting.id, restart)
    if (chosenRestart !== undefined) chosenRestarts.set(setting.id, chosenRestart)
    if (index > 0 && (ended || !kept || (!continued && replaces))) rhythmFrom = setting.startsOn
    // R6 : à partir de sa journée d'origine, un décalage donne à la grille l'origine de son ancrage ;
    // écrit sous un réglage d'avant un changement de fréquence, il est dépassé par la nouvelle origine (R3).
    const turns = shifts.filter(
      (shift) =>
        within(shift) &&
        (!earlier.has(shift.settingId) || (continued && rhythm.has(shift.settingId))),
    )
    let from = setting.startsOn
    const segments: Segment[] = []
    // R6 : un décalage part d'une échéance de la grille d'avant lui ou de l'arrivée d'un report du
    // rythme ; avant une date choisie, seul celui qui la porte (R3, TR-9).
    const lands = (turn: ReferenceLine) =>
      (isDueDay(grid, setting, turn.dueOn) && (turn.dueOn > chosenFloor || anchors.has(turn))) ||
      reports.some((report) => report.targetOn === turn.dueOn && report.dueOn > rhythmFloor)
    for (const turn of [...turns, null]) {
      if (turn !== null && !lands(turn)) continue
      const to = turn === null ? last : turn.dueOn < last ? turn.dueOn : last
      const start = later(from, plusDays(grid.floor, 1))
      for (const day of gridDays(grid.origin, setting.frequency, start, to)) {
        days.set(day, journeyOn(day, setting))
      }
      segments.push({ origin: grid.origin, from: start, to: turn?.dueOn ?? setting.endsOn })
      if (turn === null) break
      grid = turned(turn, chosenFloor)
      from = plusDays(turn.dueOn, 1)
    }
    claims.push({ setting, end, segments })
  })

  const handed = handedOf(claims, chosenRestarts)
  leftDays(
    claims.filter(({ setting }) => !handed.has(setting.id)),
    reports,
    closedFrom,
  ).forEach((journey, day) => left.set(day, journeyOn(day, journey.setting)))

  const matched = new Set<ReferenceLine>()
  const coveredOn = coverageOf([...notes, ...borrowed], borrowed, translated, settingOf, matched)

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
    // R6, TR-9 : hors de sa grille, un report est sans effet, sauf s'il porte la date choisie,
    // arrive sur la première échéance d'une origine écrite (TR-28) ou ouvre un rythme (R9.2).
    const at = settingAt(dueOn)?.id ?? ''
    const restartOn = restarts.get(at)
    const chosenOn = chosenRestarts.get(at)
    const carries = targetOn === restartOn || targetOn === chosenOn || openings.has(targetOn!)
    const before = chosenRestarts.get(report!.settingId) !== chosenOn
    if (chosenOn !== undefined && dueOn === chosenOn && before) continue
    if (origin === undefined && chosenOn !== undefined && !carries) continue
    // R11 : un report battu par une prise de la même échéance est sans effet ; parti du jour où les
    // heures changent, il emporte les siennes encore sans prise (décision du 15 octobre 2026).
    const written = settingOf(report!.settingId)
    const source = translated.has(dueOn) && !sameHours(written, from) ? written : from
    if (source === from ? covered.has(dueTime) : noted.has(keyOf(dueOn, dueTime))) continue
    if (targetOn! > dueOn) fallen.add(dueOn)
    const after = (hour: Hour) => hour === null || hour >= (dueTime ?? '')
    const leaving = hours.filter((hour) => after(hour) && !covered.has(hour))
    const moved =
      source === from
        ? leaving
        : hoursOf(written).filter((hour) => after(hour) && !noted.has(keyOf(dueOn, hour)))
    if (origin !== undefined) origin.hours = origin.hours.filter((hour) => !leaving.includes(hour))
    const stopDay = stoppedAt(targetOn!)
    const arrival = settingAt(targetOn!) ?? stopDay
    const into = stopDay === undefined ? days : left
    if (arrival === undefined || moved.length === 0) continue
    // R7 : le jour d'arrivée ne reçoit que les heures reportées, telles qu'au départ.
    const own = sameHours(arrival, source) ? arrival : source
    const day = into.get(targetOn!) ?? { setting: own, hours: [] }
    // R7, R9.2 : un nouveau rythme qui part du jour d'arrivée d'un report lui laisse ses seules heures.
    if (openings.delete(targetOn!)) day.hours = []
    if (day.hours.length === 0) day.setting = own
    // TR-9, #796 : une journée d'échéance à d'autres heures porte la dose reçue, sans en ajouter.
    if (sameHours(day.setting, source)) day.hours = [...new Set([...day.hours, ...moved])].sort()
    into.set(targetOn!, day)
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
  // TR-9 : la date choisie remplace la dose du moment : celle du premier jour du réglage s'il est une
  // échéance, sinon la dernière journée arrivée avant lui.
  const lateDays = lateDaysOf(replaced, fallen)
  replaced.filter(({ onDueDay }) => onDueDay).forEach(({ to }) => fallen.add(to))
  const pending = dues
    .filter(({ covered, day }) => !covered && !lateDays.includes(day))
    .map(({ key }) => key)
  return { pending, fallen, rhythmFrom }
}
