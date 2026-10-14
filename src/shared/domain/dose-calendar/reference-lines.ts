import { hoursOf, keyOf, sameHours } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

export const isNote = (line: ReferenceLine) => line.status === 'given' || line.status === 'missed'
const isMoreRecent = (a: ReferenceLine, b: ReferenceLine) =>
  a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)

// R1, R8 : un arrêt clôt un épisode ; la reprise en ouvre un autre.
export function episodesOf(settings: readonly ReferenceSetting[]): ReferenceSetting[][] {
  // R9, R10 : un réglage remplacé avant son premier jour par un réglage écrit après lui cède sa place ce jour-là.
  const ordered = settings
    .map((setting) => {
      const startsOn = settings
        .filter(({ createdAt }) => createdAt > setting.createdAt)
        .reduce((day, newer) => (newer.startsOn < day ? newer.startsOn : day), setting.startsOn)
      return startsOn === setting.startsOn ? setting : { ...setting, startsOn }
    })
    .sort(
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

type InForce = {
  settingAt(day: string): ReferenceSetting | undefined
  stoppedAt(day: string): ReferenceSetting | undefined
  endOf(index: number): string | null
}

// R4, R7 : les jours où une prise visant d'autres heures couvre les premières heures : premier jour et
// première échéance d'un réglage aux heures changées, arrivée d'un report parti d'autres heures.
function translatedDaysOf(
  episode: readonly ReferenceSetting[],
  live: readonly ReferenceSetting[],
  moves: readonly ReferenceLine[],
  at: InForce,
): Set<string> {
  const days = new Set<string>()
  live.forEach((setting, index) => {
    if (index > 0 && !sameHours(live[index - 1]!, setting)) {
      days.add(setting.startsOn).add(setting.firstDueOn)
    }
  })
  for (const { dueOn, targetOn, settingId } of reportsOf(moves)) {
    const arrival = at.settingAt(targetOn!) ?? at.stoppedAt(targetOn!)
    const origins = [
      at.settingAt(dueOn),
      live.find((_, index) => at.endOf(index) === dueOn),
      episode.find(({ id }) => id === settingId),
    ]
    if (arrival !== undefined && origins.some((each) => each && !sameHours(each, arrival))) {
      days.add(targetOn!)
    }
  }
  return days
}

// TR-25, R11 : par échéance et famille, la ligne la plus récente d'un épisode, quel que soit son
// réglage ; un jour traduit, une prise visant d'autres heures vise une autre échéance (R4).
export function episodeLinesOf(
  episode: readonly ReferenceSetting[],
  live: readonly ReferenceSetting[],
  allLines: readonly ReferenceLine[],
  at: InForce,
): ReferenceLine[] {
  const own = allLines.filter((line) => episode.some(({ id }) => id === line.settingId))
  const keyIn = (translated: Set<string>) => (line: ReferenceLine) => {
    const key = `${keyOf(line.dueOn, line.dueTime)} ${isNote(line) ? 'note' : line.status}`
    if (!isNote(line) || !translated.has(line.dueOn)) return key
    return `${key} ${hoursOf(episode.find(({ id }) => id === line.settingId)!).join()}`
  }
  const moves = latestBy(
    own.filter((line) => !isNote(line)),
    keyIn(new Set()),
  )
  return latestBy(own, keyIn(translatedDaysOf(episode, live, moves, at)))
}

// R7 : une ligne de report par journée, sans les reports revenus à leur date.
export const reportsOf = (lines: readonly ReferenceLine[]): ReferenceLine[] =>
  latestBy(
    lines.filter(
      (line) =>
        line.status === 'postponed' && line.targetOn !== null && line.targetOn !== line.dueOn,
    ),
    (line) => line.dueOn,
  )

// R10 : remplacé le jour même, un réglage encore sans prise n'a jamais existé.
export const isLiveIn =
  (episode: readonly ReferenceSetting[], lines: readonly ReferenceLine[]) =>
  (setting: ReferenceSetting, index: number) =>
    episode[index + 1]?.startsOn !== setting.startsOn ||
    lines.some(
      (line) => line.settingId === setting.id && (isNote(line) || line.status === 'postponed'),
    )
