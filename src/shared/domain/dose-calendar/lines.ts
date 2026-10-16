import { hoursOf, keyOf, sameFrequency } from './grid'
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
 * TR-25, R11 : l'échéance et la famille d'une ligne dans sa période, quel que soit le réglage ; le jour
 * où les heures changent, une prise visant d'autres heures vise une autre échéance (R4).
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
  /** R4 : jour noté ou déplacé → réglage de sa ligne la plus récente (TR-25), dont il garde les heures. */
  touched: ReadonlyMap<Day, string>
  /** R7, #796 : report que la date choisie emmène → le réglage dont elle est la première échéance. */
  chosenArrivals: ReadonlyMap<Line, Setting>
}

// R10 : à fréquence gardée seulement, la date choisie emmène le report (#796).
function chosenArrivalsOf(reports: readonly Line[], span: Span): Map<Line, Setting> {
  const createdAt = (id: string) => span.episode.find((setting) => setting.id === id)?.createdAt
  const chosen = span.live.filter(
    (setting, index) =>
      setting.firstDueChosen &&
      index > 0 &&
      sameFrequency(span.live[index - 1]!.frequency, setting.frequency),
  )
  const arrivals = new Map<Line, Setting>()
  for (const report of reports) {
    const written = createdAt(report.settingId) ?? ''
    const picker = chosen.find(
      (setting) => setting.firstDueOn === report.targetOn && setting.createdAt > written,
    )
    if (picker !== undefined) arrivals.set(report, picker)
  }
  return arrivals
}

function touchedDays(
  notes: readonly Line[],
  reports: readonly Line[],
  chosenArrivals: ReadonlyMap<Line, Setting>,
) {
  const latest = new Map<Day, Line>()
  const touch = (day: Day, line: Line) => {
    const kept = latest.get(day)
    if (kept === undefined || isMoreRecent(line, kept)) latest.set(day, line)
  }
  notes.forEach((note) => touch(note.dueOn, note))
  for (const report of reports) {
    touch(report.dueOn, report)
    if (!chosenArrivals.has(report)) touch(report.targetOn!, report)
  }
  return new Map([...latest].map(([day, line]) => [day, line.settingId]))
}

export function episodeLines(lines: readonly Line[], span: Span): EpisodeLines {
  const ids = new Set(span.episode.map(({ id }) => id))
  const own = lines.filter((line) => ids.has(line.settingId))
  const doseKey = doseKeyOf(span.episode, span.hoursChangeOn)
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
  const notes = kept.filter(isNote)
  const chosenArrivals = chosenArrivalsOf(reports, span)
  const touched = touchedDays(notes, reports, chosenArrivals)
  return { kept, notes, reports, shifts, idle, doseKey, touched, chosenArrivals }
}
