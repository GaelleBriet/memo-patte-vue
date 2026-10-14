import { hoursOf, keyOf } from './grid'
import type { Day, IdleReason, Line, Setting } from './types'

export const isNote = (line: Pick<Line, 'status'>): boolean =>
  line.status === 'given' || line.status === 'missed'

/** « Avancée au … » plutôt que « Reportée au … » : la nouvelle date précède l'échéance remplacée. */
export const isAdvanced = (line: Pick<Line, 'status' | 'dueOn' | 'targetOn'>): boolean =>
  line.status === 'postponed' && line.targetOn !== null && line.targetOn < line.dueOn

export const familyOf = (line: Pick<Line, 'status'>): string =>
  isNote(line) ? 'note' : line.status

const isMoreRecent = (a: Line, b: Line): boolean =>
  a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)

/** TR-25 : par clé, la ligne modifiée le plus récemment ; triées par jour d'échéance. */
export function latestBy(lines: readonly Line[], keyOfLine: (line: Line) => string): Line[] {
  const latest = new Map<string, Line>()
  for (const line of lines) {
    const kept = latest.get(keyOfLine(line))
    if (kept === undefined || isMoreRecent(line, kept)) latest.set(keyOfLine(line), line)
  }
  return [...latest.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
}

/**
 * TR-25, R11 : l'échéance et la famille d'une ligne dans sa période, quel que soit le réglage ; le jour
 * où les heures changent, une prise visant d'autres heures vise une autre échéance (R4).
 */
export function doseKeyOf(
  episode: readonly Setting[],
  hoursChangeOn: ReadonlySet<Day>,
): (line: Line) => string {
  const byId = new Map(episode.map((setting) => [setting.id, setting]))
  return (line) => {
    const key = `${keyOf(line.dueOn, line.dueTime)} ${familyOf(line)}`
    if (!isNote(line) || !hoursChangeOn.has(line.dueOn)) return key
    return `${key} ${hoursOf(byId.get(line.settingId)!.times).join()}`
  }
}

/** Les lignes d'un épisode que le calendrier lit, et celles qu'il ne lit pas (R11), avec leur raison. */
export type EpisodeLines = {
  /** Une ligne par échéance et famille (`doseKeyOf`). */
  kept: Line[]
  notes: Line[]
  /** Une ligne de report par journée, sans les reports revenus à leur date. */
  reports: Line[]
  /** Une ligne de décalage par journée. */
  shifts: Line[]
  idle: Map<string, IdleReason>
}

export function episodeLines(
  lines: readonly Line[],
  episode: readonly Setting[],
  hoursChangeOn: ReadonlySet<Day>,
): EpisodeLines {
  const ids = new Set(episode.map(({ id }) => id))
  const own = lines.filter((line) => ids.has(line.settingId))
  const kept = latestBy(own, doseKeyOf(episode, hoursChangeOn))
  const idle = new Map<string, IdleReason>()
  const keptIds = new Set(kept.map(({ id }) => id))
  own.filter(({ id }) => !keptIds.has(id)).forEach(({ id }) => idle.set(id, 'superseded'))
  const moving = kept.filter((line) => {
    if (line.status !== 'postponed') return false
    if (line.targetOn !== null && line.targetOn !== line.dueOn) return true
    idle.set(line.id, 'back-to-date')
    return false
  })
  const reports = latestBy(moving, (line) => line.dueOn)
  const shifts = latestBy(
    kept.filter((line) => line.status === 'shift' && line.targetOn !== null),
    (line) => line.dueOn,
  )
  for (const line of kept) {
    if (line.status === 'shift' && line.targetOn === null) idle.set(line.id, 'outside')
  }
  for (const line of [...moving, ...kept.filter((line) => line.status === 'shift')]) {
    if (!idle.has(line.id) && !reports.includes(line) && !shifts.includes(line)) {
      idle.set(line.id, 'superseded')
    }
  }
  return { kept, notes: kept.filter(isNote), reports, shifts, idle }
}
