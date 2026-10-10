import {
  calendarOf,
  episodesOf,
  isNote,
  keyOf,
  latestBy,
  longestStep,
  plusDays,
} from './reference-calendar'
import type {
  ReferenceInput,
  ReferenceLine,
  ReferencePhase,
  ReferenceReading,
  ReferenceSetting,
} from './reference-types'

export type {
  ReferenceFrequency,
  ReferenceInput,
  ReferenceLine,
  ReferencePhase,
  ReferenceReading,
  ReferenceSetting,
} from './reference-types'

const dayOf = (key: string) => key.slice(0, 10)

// R8 : une prise d'avant l'arrêt ne couvre la reprise que pour sa première journée, le jour même.
function borrowedNotes(
  episodes: ReferenceSetting[][],
  index: number,
  lines: readonly ReferenceLine[],
): ReferenceLine[] {
  const episode = episodes[index]!
  const first = episode.filter(({ startsOn }) => startsOn === episode[0]!.startsOn).at(-1)!
  if (index === 0 || first.firstDueOn !== first.startsOn) return []
  const before = new Set(episodes.slice(0, index).flatMap((earlier) => earlier.map(({ id }) => id)))
  return latestBy(
    lines.filter(
      (line) => before.has(line.settingId) && isNote(line) && line.dueOn === first.startsOn,
    ),
    (line) => keyOf(line.dueOn, line.dueTime),
  )
}

export function referenceReading({
  settings,
  lines,
  today,
  until,
}: ReferenceInput): ReferenceReading {
  const episodes = episodesOf(settings)
  const yesterday = plusDays(today, -1)
  // Au-delà de la dernière ligne, une journée sans prise tombe au plus un pas plus loin.
  const reach = plusDays(
    [until, ...lines.flatMap(({ dueOn, targetOn }) => [dueOn, targetOn ?? dueOn])].sort().at(-1)!,
    Math.max(0, ...settings.map(({ frequency }) => longestStep(frequency))),
  )
  const calendars = episodes.map((episode, index) =>
    calendarOf(settings, episode, lines, borrowedNotes(episodes, index, lines), reach),
  )
  const last = calendars.pop()
  const setting = episodes.at(-1)?.at(-1)
  const unlogged = calendars.flatMap(({ pending }) =>
    pending.filter((key) => dayOf(key) <= yesterday),
  )
  if (last === undefined || setting === undefined) {
    return { phase: 'ended', finished: unlogged.length === 0, current: [], unlogged, upcoming: [] }
  }
  unlogged.push(
    ...last.pending.filter((key) => dayOf(key) < setting.startsOn && dayOf(key) <= yesterday),
  )
  const own = last.pending.filter((key) => dayOf(key) >= setting.startsOn)
  const closed = (phase: ReferencePhase, missed: string[]): ReferenceReading => {
    const all = [...unlogged, ...missed].sort()
    return { phase, finished: all.length === 0, current: [], unlogged: all, upcoming: [] }
  }
  const past = own.filter((key) => dayOf(key) <= yesterday)
  if (setting.stoppedOn !== null) return closed('stopped', past)
  if (setting.endsOn !== null && setting.endsOn < today) return closed('ended', own)

  // TR-10, TR-13 : la dernière journée arrivée reste la dose du moment tant qu'elle a des heures sans prise.
  const lastDay = [...last.fallen]
    .filter((day) => day >= setting.startsOn && day <= today)
    .sort()
    .at(-1)
  const ofLastDay = own.filter((key) => dayOf(key) === lastDay)
  const coming = own.find((key) => dayOf(key) > today)
  const current = ofLastDay.length > 0 ? ofLastDay : coming === undefined ? [] : [coming]
  const day = current[0] === undefined ? undefined : dayOf(current[0])
  const phase =
    day === undefined ? 'ended' : day === today ? 'today' : day < today ? 'overdue' : 'upcoming'
  const missed = own.filter((key) => dayOf(key) <= today && !current.includes(key))
  return {
    phase,
    finished: phase === 'ended' && unlogged.length + missed.length === 0,
    current,
    unlogged: [...unlogged, ...missed].sort(),
    upcoming: own.filter((key) => dayOf(key) >= today && dayOf(key) <= until),
  }
}
