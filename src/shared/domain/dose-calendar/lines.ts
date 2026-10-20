import { keyOf, sameFrequency, sameHours } from './grid'
import type { Span } from './settings'
import type { Day, IdleReason, Line, Setting } from './types'

/** Une prise : donnée ou oubliée ; une ligne « pas à donner » n'en est jamais une (#873). */
export const isTaken = (line: Pick<Line, 'status'>): boolean =>
  line.status === 'given' || line.status === 'missed'

/** #873 : une ligne qui couvre son échéance, « pas à donner » comprise (journée touchée, TR-25). */
export const isNote = (line: Pick<Line, 'status'>): boolean =>
  isTaken(line) || line.status === 'not-due'

/** « Avancée au … » plutôt que « Reportée au … » : la nouvelle date précède l'échéance remplacée. */
export const isAdvanced = (line: Pick<Line, 'status' | 'dueOn' | 'targetOn'>): boolean =>
  line.status === 'postponed' && line.targetOn !== null && line.targetOn < line.dueOn

/** #873 : une prise et la ligne « pas à donner » de la même dose ne se remplacent jamais. */
export const familyOf = (line: Pick<Line, 'status'>): string =>
  isTaken(line) ? 'note' : line.status

export const isMoreRecent = (a: Line, b: Line): boolean =>
  a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)

/** #867, #873 : entre un report et la ligne « pas à donner » de sa dose, au départ comme à l'arrivée, le plus récent l'emporte. */
export const reportBeats = (report: Line, note: Line): boolean => isMoreRecent(report, note)

/** TR-25 : par clé, la ligne modifiée le plus récemment ; triées par jour d'échéance. */
export function latestBy(lines: readonly Line[], keyOfLine: (line: Line) => string): Line[] {
  const latest = new Map<string, Line>()
  for (const line of lines) {
    const kept = latest.get(keyOfLine(line))
    if (kept === undefined || isMoreRecent(line, kept)) latest.set(keyOfLine(line), line)
  }
  return [...latest.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
}

/** TR-25, R11 : l'échéance et la famille d'une ligne, quel que soit son réglage : deux prises du même jour et de la même heure sont la même dose. */
const doseKeyOf = (line: Line): string => `${keyOf(line.dueOn, line.dueTime)} ${familyOf(line)}`

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

// #938 : réécrit après lui sur un autre téléphone, le réglage d'un report n'a plus les heures vues ;
// les heures se jugent sur la date des réglages, le conflit sur celle de la grille (#939).
function rewrittenAfter(line: Line, setting: Setting | undefined): boolean {
  const at = setting?.updatedAt
  return at !== undefined && at > setting!.createdAt && at > line.updatedAt
}

function touchedDays(
  notes: readonly Line[],
  reports: readonly Line[],
  chosenArrivals: ReadonlyMap<Line, Setting>,
  settingOf: (id: string) => Setting | undefined,
) {
  const latest = new Map<Day, { line: Line; settingId: string }>()
  const touch = (day: Day, line: Line, settingId = line.settingId) => {
    const kept = latest.get(day)
    if (kept === undefined || isMoreRecent(line, kept.line)) latest.set(day, { line, settingId })
  }
  notes.forEach((note) => touch(note.dueOn, note))
  for (const report of reports) {
    // R4 : sa journée de départ se lit alors comme sans lui.
    if (!rewrittenAfter(report, settingOf(report.settingId))) touch(report.dueOn, report)
    // R7, #796 : le jour choisi qui emmène le report garde les heures du réglage qui l'a choisi ; une
    // autre arrivée garde les doses de sa journée et y ajoute les siennes.
    const chosen = chosenArrivals.get(report)
    if (chosen !== undefined) touch(report.targetOn!, report, chosen.id)
  }
  return new Map([...latest].map(([day, { settingId }]) => [day, settingId]))
}

/** R4 : le premier jour d'un réglage aux heures changées est traduit, sauf une journée touchée sous
 * d'autres heures que celles du réglage qui cède la place : elle garde ses doses. */
export function translatedDays(
  live: readonly Setting[],
  touchedOn: (day: Day) => Setting | undefined,
): Set<Day> {
  const days = new Set<Day>()
  live.forEach((setting, index) => {
    const prior = live[index - 1]
    if (prior === undefined || sameHours(prior, setting)) return
    const touched = touchedOn(setting.startsOn)
    if (touched === undefined || sameHours(touched, prior) || sameHours(touched, setting)) {
      days.add(setting.startsOn)
    }
  })
  return days
}

export function episodeLines(lines: readonly Line[], span: Span): EpisodeLines {
  const ids = new Set(span.episode.map(({ id }) => id))
  const own = lines.filter((line) => ids.has(line.settingId))
  const doseKey = doseKeyOf
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
  // #873 : une prise l'emporte toujours sur la ligne « pas à donner » de sa dose ; #867 : un report plus
  // récent qu'elle sur sa dose de départ aussi.
  const taken = new Set(kept.filter(isTaken).map(({ dueOn, dueTime }) => keyOf(dueOn, dueTime)))
  const beaten = (note: Line) =>
    note.status === 'not-due' &&
    (taken.has(keyOf(note.dueOn, note.dueTime)) ||
      reports.some(
        (report) =>
          report.dueOn === note.dueOn &&
          report.dueTime === note.dueTime &&
          reportBeats(report, note),
      ))
  kept.filter(beaten).forEach(({ id }) => idle.set(id, 'beaten'))
  const notes = kept.filter((line) => isNote(line) && !beaten(line))
  const chosenArrivals = chosenArrivalsOf(reports, span)
  const settingOf = (id: string) => span.episode.find((setting) => setting.id === id)
  const touched = touchedDays(notes, reports, chosenArrivals, settingOf)
  return { kept, notes, reports, shifts, idle, doseKey, touched, chosenArrivals }
}
