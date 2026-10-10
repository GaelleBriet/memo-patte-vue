import { keyOf } from './grid'
import { isNote, latestBy } from './lines'
import type { Day, Line, Setting } from './types'

/** R1, R8 : réglages dans l'ordre ; un arrêt clôt un épisode, la reprise en ouvre un autre. */
export function episodesOf(settings: readonly Setting[]): Setting[][] {
  const ordered = [...settings].sort(
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
  /** Premier jour où le réglage ne vaut plus : début du suivant, ou arrêt ; `null` : ouvert. */
  endOf(index: number): Day | null
  /** Le réglage en vigueur ce jour-là, date de fin comprise ; aucun avant, après la fin ou l'arrêt. */
  settingAt(day: Day): Setting | undefined
}

/** R10 : remplacé le jour même, un réglage sans prise ni report n'a jamais existé. */
export function spanOf(episode: readonly Setting[], kept: readonly Line[]): Span {
  const live = episode.filter(
    (setting, index) =>
      episode[index + 1]?.startsOn !== setting.startsOn ||
      kept.some(
        (line) => line.settingId === setting.id && (isNote(line) || line.status === 'postponed'),
      ),
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
  return { live, endOf, settingAt }
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
