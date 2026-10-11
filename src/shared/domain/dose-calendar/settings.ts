import { keyOf, sameFrequency } from './grid'
import { isNote, latestBy } from './lines'
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
  live: Setting[]
  /** R3, R10 : les réglages lus dans l'ordre ; remplacé le jour même, un réglage n'y garde que sa grille, pour le suivant de même fréquence. */
  chain: Setting[]
  /** Premier jour où le réglage ne vaut plus : début du suivant, ou arrêt ; `null` : ouvert. */
  endOf(index: number): Day | null
  /** Le réglage en vigueur ce jour-là, date de fin comprise ; aucun avant, après la fin ou l'arrêt. */
  settingAt(day: Day): Setting | undefined
}

/** R8, TR-32 : les réglages de la période (épisode) qui contient ce réglage. */
export function episodeIdsOf(settings: readonly Setting[], settingId: string): Set<string> {
  const episode = episodesOf(settings).find((each) => each.some(({ id }) => id === settingId))
  return new Set((episode ?? []).map(({ id }) => id))
}

/** TR-28, R10 : une prise, donnée ou oubliée, ou un report rangés sous ce réglage. */
export const hasNotes = (setting: Setting, lines: readonly Line[]): boolean =>
  lines.some(
    (line) => line.settingId === setting.id && (isNote(line) || line.status === 'postponed'),
  )

/** R10 : remplacé le jour même, un réglage sans prise ni report n'a jamais existé. */
export function spanOf(episode: readonly Setting[], kept: readonly Line[]): Span {
  const isLive = (setting: Setting, index: number) =>
    episode[index + 1]?.startsOn !== setting.startsOn || hasNotes(setting, kept)
  const live = episode.filter(isLive)
  const chain = episode.filter(
    (setting, index) =>
      isLive(setting, index) || sameFrequency(setting.frequency, episode[index + 1]!.frequency),
  )
  const endOf = (index: number) => live[index + 1]?.startsOn ?? live[index]!.stoppedOn
  const settingAt = (day: Day) => {
    const index = live.filter(({ startsOn }) => startsOn <= day).length - 1
    const setting = live[index]
    if (setting === undefined) return undefined
    const end = endOf(index)
    const open = (end === null || day < end) && (setting.endsOn === null || day <= setting.endsOn)
    return open ? setting : undefined
  }
  return { live, chain, endOf, settingAt }
}

/**
 * R8 : les prises d'avant l'arrêt ne couvrent la reprise que pour sa première journée, quand elles
 * visent ce jour-là et que la reprise commence par une échéance.
 */
export function borrowedNotes(
  episodes: Setting[][],
  index: number,
  lines: readonly Line[],
): Line[] {
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
