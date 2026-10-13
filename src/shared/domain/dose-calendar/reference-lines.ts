import { keyOf } from './reference-grid'
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

// TR-25 : par réglage, échéance et famille, la ligne la plus récente d'un épisode.
export function episodeLinesOf(
  episode: readonly ReferenceSetting[],
  allLines: readonly ReferenceLine[],
): ReferenceLine[] {
  const ids = new Set(episode.map(({ id }) => id))
  return latestBy(
    allLines.filter((line) => ids.has(line.settingId)),
    (line) =>
      `${line.settingId} ${keyOf(line.dueOn, line.dueTime)} ${isNote(line) ? 'note' : line.status}`,
  )
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
