import { keyOf, plusDays, sameFrequency } from './grid'
import { isNote, isTaken, latestBy } from './lines'
import type { Day, Line, Setting } from './types'

/** R9, R10 : un réglage remplacé avant son premier jour par un réglage écrit après lui cède sa place ce jour-là. */
function replacedBefore(settings: readonly Setting[], setting: Setting): Setting {
  const startsOn = settings
    .filter(({ createdAt }) => createdAt > setting.createdAt)
    .reduce((day, newer) => (newer.startsOn < day ? newer.startsOn : day), setting.startsOn)
  return startsOn === setting.startsOn ? setting : { ...setting, startsOn }
}

/** R1, R8 : réglages dans l'ordre ; un arrêt clôt un épisode, la reprise en ouvre un autre. */
export function episodesOf(settings: readonly Setting[]): Setting[][] {
  const ordered = settings
    .map((setting) => replacedBefore(settings, setting))
    .sort(
      (a, b) =>
        a.startsOn.localeCompare(b.startsOn) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
  const episodes: Setting[][] = [[]]
  for (const setting of ordered) {
    episodes.at(-1)!.push(setting)
    if (setting.stoppedOn !== null) episodes.push([])
  }
  return episodes.filter((episode) => episode.length > 0)
}

/** Les réglages d'un épisode qui ont des jours, chacun jusqu'au premier jour du suivant (R1). */
export type Span = {
  /** Tous les réglages de l'épisode, dans l'ordre. */
  episode: readonly Setting[]
  live: Setting[]
  /** R3, R10 : les réglages lus dans l'ordre ; remplacé le jour même, un réglage n'y garde que sa grille, pour le suivant de même fréquence. */
  chain: Setting[]
  /** Premier jour où le réglage ne vaut plus : début du suivant, ou arrêt ; `null` : ouvert. */
  endOf(index: number): Day | null
  /** TR-30 : premier jour que l'épisode ne lit plus, le lendemain de l'arrêt. */
  closedFrom: Day | null
  /** TR-30 : le réglage arrêté, le jour de l'arrêt que l'épisode lit encore, sans y laisser d'échéance. */
  stoppedAt(day: Day): Setting | undefined
  /** Le réglage en vigueur ce jour-là, date de fin comprise ; aucun avant, après la fin ou l'arrêt. */
  settingAt(day: Day): Setting | undefined
}

/** R8, TR-32 : les réglages de la période (épisode) qui contient ce réglage. */
export function episodeOf(settings: readonly Setting[], settingId: string): Setting[] {
  return episodesOf(settings).find((each) => each.some(({ id }) => id === settingId)) ?? []
}

export function episodeIdsOf(settings: readonly Setting[], settingId: string): Set<string> {
  return new Set(episodeOf(settings, settingId).map(({ id }) => id))
}

/** TR-28, R10 : une prise, donnée ou oubliée, ou un report rangés sous ce réglage. */
export const hasNotes = (setting: Setting, lines: readonly Line[]): boolean =>
  lines.some(
    (line) => line.settingId === setting.id && (isTaken(line) || line.status === 'postponed'),
  )

/** R10 : remplacé le jour même, un réglage sans prise ni report n'a jamais existé. */
const isLiveIn =
  (episode: readonly Setting[], lines: readonly Line[]) => (setting: Setting, index: number) =>
    episode[index + 1]?.startsOn !== setting.startsOn || hasNotes(setting, lines)

export function spanOf(episode: readonly Setting[], lines: readonly Line[]): Span {
  const isLive = isLiveIn(episode, lines)
  const live = episode.filter(isLive)
  const chain = episode.filter(
    (setting, index) =>
      isLive(setting, index) || sameFrequency(setting.frequency, episode[index + 1]!.frequency),
  )
  const endOf = (index: number) => live[index + 1]?.startsOn ?? live[index]!.stoppedOn
  const stopped = live.at(-1)!
  const stop = stopped.stoppedOn
  const closedFrom = stop === null ? null : plusDays(stop, 1)
  const settingAt = (day: Day) => {
    const index = live.filter(({ startsOn }) => startsOn <= day).length - 1
    const setting = live[index]
    if (setting === undefined) return undefined
    const end = endOf(index)
    const open = (end === null || day < end) && (setting.endsOn === null || day <= setting.endsOn)
    return open ? setting : undefined
  }
  const stoppedAt = (day: Day) =>
    day === stop && (stopped.endsOn === null || day <= stopped.endsOn) ? stopped : undefined
  return { episode, live, chain, endOf, closedFrom, stoppedAt, settingAt }
}

/** R8, Q-G3 : les prises d'avant l'arrêt du jour où la reprise est écrite, la plus récente par échéance. */
export function borrowedNotes(
  episodes: Setting[][],
  index: number,
  lines: readonly Line[],
): Line[] {
  const episode = episodes[index]!
  const first = episode.filter(({ startsOn }) => startsOn === episode[0]!.startsOn).at(-1)!
  if (index === 0) return []
  const before = new Set(episodes.slice(0, index).flatMap((earlier) => earlier.map(({ id }) => id)))
  return latestBy(
    lines.filter(
      (line) => before.has(line.settingId) && isNote(line) && line.dueOn === first.startsOn,
    ),
    (line) => keyOf(line.dueOn, line.dueTime),
  )
}

/** TR-30, #594 : chaque réglage clos avant sa première échéance, le jour de l'arrêt compris dans le réglage. */
export function closedBeforeFirstDue(settings: readonly Setting[]): boolean {
  const ordered = episodesOf(settings).flat()
  return ordered.every((setting, index) => {
    const next = ordered[index + 1]
    const before = next === undefined ? null : plusDays(next.startsOn, -1)
    const last = [setting.endsOn, setting.stoppedOn, before].filter((day) => day !== null).sort()[0]
    return last !== undefined && last < setting.firstDueOn
  })
}
