import { hoursOf, keyOf, sameHours } from './grid'
import type { Span } from './settings'
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
 * TR-25, R11 : l'échéance et la famille d'une ligne dans sa période, quel que soit le réglage ; un jour
 * que le calendrier traduit, une prise visant d'autres heures vise une autre échéance (R4).
 */
function doseKeyOf(
  episode: readonly Setting[],
  translated: ReadonlySet<Day>,
): (line: Line) => string {
  const byId = new Map(episode.map((setting) => [setting.id, setting]))
  return (line) => {
    const key = `${keyOf(line.dueOn, line.dueTime)} ${familyOf(line)}`
    if (!isNote(line) || !translated.has(line.dueOn)) return key
    return `${key} ${hoursOf(byId.get(line.settingId)!.times).join()}`
  }
}

/** R7 : une ligne de report par journée, sans les reports revenus à leur date. */
const reportsOf = (kept: readonly Line[]): Line[] =>
  latestBy(
    kept.filter(
      (line) =>
        line.status === 'postponed' && line.targetOn !== null && line.targetOn !== line.dueOn,
    ),
    (line) => line.dueOn,
  )

/** R4, R7 : les jours que le calendrier traduit : heures changées, arrivée d'un report à d'autres heures. */
function translatedDays(span: Span, reports: readonly Line[]): Set<Day> {
  const byId = new Map(span.episode.map((setting) => [setting.id, setting]))
  const days = new Set(span.hoursChangeOn)
  for (const { dueOn, targetOn, settingId } of reports) {
    const arrival = span.settingAt(targetOn!) ?? span.stoppedAt(targetOn!)
    if (arrival === undefined) continue
    // Toutes les origines que le calendrier peut lire : manquer un jour traduit fondrait deux doses en une.
    const ceding = span.live.find((_, index) => span.endOf(index) === dueOn)
    const origins = [span.settingAt(dueOn), ceding, byId.get(settingId)]
    if (origins.some((origin) => origin !== undefined && !sameHours(origin, arrival))) {
      days.add(targetOn!)
    }
  }
  return days
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
  doseKey: (line: Line) => string
}

export function episodeLines(lines: readonly Line[], span: Span): EpisodeLines {
  const ids = new Set(span.episode.map(({ id }) => id))
  const own = lines.filter((line) => ids.has(line.settingId))
  const moves = latestBy(
    own.filter((line) => !isNote(line)),
    doseKeyOf(span.episode, new Set()),
  )
  const doseKey = doseKeyOf(span.episode, translatedDays(span, reportsOf(moves)))
  const kept = latestBy(own, doseKey)
  const idle = new Map<string, IdleReason>()
  const keptIds = new Set(kept.map(({ id }) => id))
  own.filter(({ id }) => !keptIds.has(id)).forEach(({ id }) => idle.set(id, 'superseded'))
  const moving = kept.filter((line) => {
    if (line.status !== 'postponed') return false
    if (line.targetOn !== null && line.targetOn !== line.dueOn) return true
    idle.set(line.id, 'back-to-date')
    return false
  })
  const reports = reportsOf(moving)
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
  return { kept, notes: kept.filter(isNote), reports, shifts, idle, doseKey }
}
